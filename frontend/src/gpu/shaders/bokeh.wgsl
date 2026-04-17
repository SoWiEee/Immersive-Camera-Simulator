// bokeh.wgsl — depth-aware disc bokeh with foreground bleed rejection

struct CameraParams {
  exposure_ev:       f32,
  contrast:          f32,
  saturation:        f32,
  color_temp:        f32,
  iso:               f32,
  noise_coeff:       f32,
  aperture:          f32,
  focus_depth:       f32,
  bokeh_scale:       f32,
  motion_angle:      f32,
  motion_strength:   f32,
  vignette_strength: f32,
  width:             u32,
  height:            u32,
  _pad0:             u32,
  _pad1:             u32,
}

@group(0) @binding(0) var input_tex:  texture_2d<f32>;
@group(0) @binding(1) var depth_tex:  texture_2d<f32>;  // r32float, unfilterable
@group(0) @binding(2) var output_tex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var<uniform>   params: CameraParams;

const NUM_SAMPLES: i32 = 32;
const GOLDEN_ANGLE: f32 = 2.39996323; // 2π × (1 - 1/φ)

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let coord = vec2<i32>(gid.xy);
  if (coord.x >= i32(params.width) || coord.y >= i32(params.height)) { return; }

  let center_col   = textureLoad(input_tex, coord, 0).rgb;
  let center_depth = textureLoad(depth_tex,  coord, 0).r;

  let depth_delta  = abs(center_depth - params.focus_depth);
  let blur_radius  = depth_delta * params.bokeh_scale;

  // Sharp enough: skip convolution
  if (blur_radius < 0.5) {
    textureStore(output_tex, coord, vec4<f32>(center_col, 1.0));
    return;
  }

  var color_sum  = vec3<f32>(0.0);
  var weight_sum = 0.0;

  for (var i: i32 = 0; i < NUM_SAMPLES; i++) {
    let fi = f32(i) + 0.5;
    // Fibonacci spiral point inside disc
    let r     = sqrt(fi / f32(NUM_SAMPLES)) * blur_radius;
    let theta = fi * GOLDEN_ANGLE;
    let offset = vec2<f32>(cos(theta), sin(theta)) * r;

    let sc = clamp(
      coord + vec2<i32>(round(offset)),
      vec2<i32>(0),
      vec2<i32>(i32(params.width) - 1, i32(params.height) - 1),
    );

    let sample_depth = textureLoad(depth_tex,  sc, 0).r;
    let sample_col   = textureLoad(input_tex,  sc, 0).rgb;

    // Depth-weighted blend: suppress foreground color from bleeding into background.
    // If the sample is significantly closer (smaller depth = nearer), downweight it
    // when we are rendering a background pixel.
    let depth_diff = sample_depth - center_depth;
    // smoothstep: 0 if sample is 0.1+ closer than center, 1 if same/farther
    let w = smoothstep(-0.1, 0.0, depth_diff);

    color_sum  += sample_col * w;
    weight_sum += w;
  }

  let result = color_sum / max(weight_sum, 0.001);
  textureStore(output_tex, coord, vec4<f32>(result, 1.0));
}
