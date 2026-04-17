// exposure.wgsl — EV adjustment, contrast, saturation, color temperature

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

fn luma(c: vec3<f32>) -> f32 {
  return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let coord = vec2<i32>(gid.xy);
  if (coord.x >= i32(params.width) || coord.y >= i32(params.height)) { return; }

  var col = textureLoad(input_tex, coord, 0).rgb;

  // EV: multiply by 2^ev
  col *= pow(2.0, params.exposure_ev);

  // Color temperature: positive = warm (more R, less B)
  col.r = col.r * (1.0 + params.color_temp * 0.18);
  col.b = col.b * (1.0 - params.color_temp * 0.18);
  col = max(col, vec3<f32>(0.0));

  // Contrast around midpoint 0.5
  col = (col - 0.5) * params.contrast + 0.5;
  col = max(col, vec3<f32>(0.0));

  // Saturation (luma-preserving)
  let grey = luma(col);
  col = mix(vec3<f32>(grey), col, params.saturation);

  textureStore(output_tex, coord, vec4<f32>(col, 1.0));
}
