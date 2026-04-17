// vignette.wgsl — radial vignette + per-lens chromatic aberration

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
  blade_count:       u32,
  blade_rotation:    f32,
  swirl_strength:    f32,
  chrom_aberr:       f32,
  _pad0:             u32,
  _pad1:             u32,
}

@group(0) @binding(0) var input_tex:  texture_2d<f32>;
@group(0) @binding(1) var output_tex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var<uniform>   params: CameraParams;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let coord = vec2<i32>(gid.xy);
  if (coord.x >= i32(params.width) || coord.y >= i32(params.height)) { return; }

  let wf = f32(params.width);
  let hf = f32(params.height);
  // NDC center [-1, 1]
  let ndc = (vec2<f32>(coord) + 0.5) / vec2<f32>(wf, hf) * 2.0 - 1.0;

  // Per-lens chromatic aberration: R shifts outward, B shifts inward
  let ca = params.chrom_aberr * 0.015;
  let ca_shift = ndc * ca;
  let r_coord = clamp(
    coord + vec2<i32>(round(ca_shift * vec2<f32>(wf, hf))),
    vec2<i32>(0), vec2<i32>(i32(params.width) - 1, i32(params.height) - 1),
  );
  let b_coord = clamp(
    coord - vec2<i32>(round(ca_shift * vec2<f32>(wf, hf))),
    vec2<i32>(0), vec2<i32>(i32(params.width) - 1, i32(params.height) - 1),
  );

  var col = textureLoad(input_tex, coord, 0).rgb;
  col.r = textureLoad(input_tex, r_coord, 0).r;
  col.b = textureLoad(input_tex, b_coord, 0).b;

  // Radial vignette: smooth falloff toward corners
  let dist2 = dot(ndc, ndc);
  let vignette = 1.0 - params.vignette_strength * smoothstep(0.25, 1.6, dist2);
  col *= vignette;

  textureStore(output_tex, coord, vec4<f32>(col, 1.0));
}
