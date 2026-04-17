// blit.wgsl — Full-screen quad render pass.
// Samples a texture and writes to the canvas swap-chain texture.

struct VertexOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv:        vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VertexOut {
  // Two-triangle strip covering NDC [-1, 1]
  var positions = array<vec2<f32>, 6>(
    vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0,  1.0),
    vec2<f32>( 1.0,  1.0),
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
  );
  // UV: flip Y so (0,0) = top-left
  var uvs = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 1.0),
  );
  var out: VertexOut;
  out.pos = vec4<f32>(positions[vid], 0.0, 1.0);
  out.uv  = uvs[vid];
  return out;
}

@group(0) @binding(0) var tex         : texture_2d<f32>;
@group(0) @binding(1) var tex_sampler : sampler;

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
  return textureSample(tex, tex_sampler, in.uv);
}
