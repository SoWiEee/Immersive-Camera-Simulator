// gaussian.wgsl — Separable Gaussian blur (one pass: horizontal or vertical)
//
// Usage: dispatch twice.
//   Pass 0 (horizontal): input = image texture,  output = workTexA
//   Pass 1 (vertical):   input = workTexA,       output = workTexB
//
// Workgroup size: 16×16. Dispatch ceil(width/16) × ceil(height/16) × 1.

struct Params {
  radius:     u32,  // blur radius in pixels (1–64)
  horizontal: u32,  // 1 = horizontal pass, 0 = vertical pass
}

@group(0) @binding(0) var input_tex : texture_2d<f32>;
@group(0) @binding(1) var output_tex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var<uniform> params: Params;

fn gauss(offset: f32, sigma: f32) -> f32 {
  return exp(-(offset * offset) / (2.0 * sigma * sigma));
}

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims  = vec2<i32>(textureDimensions(input_tex));
  let coord = vec2<i32>(gid.xy);
  if (coord.x >= dims.x || coord.y >= dims.y) { return; }

  let r     = i32(params.radius);
  let sigma = f32(r) * 0.5 + 0.5;

  var color_sum  = vec4<f32>(0.0);
  var weight_sum = 0.0;

  for (var i = -r; i <= r; i++) {
    let sc: vec2<i32> = select(
      vec2<i32>(coord.x, clamp(coord.y + i, 0, dims.y - 1)),   // vertical
      vec2<i32>(clamp(coord.x + i, 0, dims.x - 1), coord.y),   // horizontal
      params.horizontal == 1u
    );
    let w = gauss(f32(i), sigma);
    color_sum  += textureLoad(input_tex, sc, 0) * w;
    weight_sum += w;
  }

  textureStore(output_tex, coord, color_sum / weight_sum);
}
