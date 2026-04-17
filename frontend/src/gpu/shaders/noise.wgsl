// noise.wgsl — ISO-based luminance + chrominance noise (sensor-aware)

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
@group(0) @binding(1) var output_tex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var<uniform>   params: CameraParams;

fn hash(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

fn hash3(p: vec2<f32>) -> vec3<f32> {
  return vec3<f32>(
    hash(p),
    hash(p + vec2<f32>(5.17, 1.33)),
    hash(p + vec2<f32>(9.41, 3.71)),
  );
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let coord = vec2<i32>(gid.xy);
  if (coord.x >= i32(params.width) || coord.y >= i32(params.height)) { return; }

  var col = textureLoad(input_tex, coord, 0).rgb;

  // Noise intensity scales with log2(ISO/100), modulated by sensor base noise
  let iso_stops = log2(params.iso / 100.0 + 1.0);
  let intensity = params.noise_coeff * iso_stops;

  let fc = vec2<f32>(coord) + 0.5;

  // Luminance noise (Gaussian-distributed via Box-Muller approximation)
  let u1 = hash(fc);
  let u2 = hash(fc + vec2<f32>(17.3));
  let gauss = sqrt(-2.0 * log(max(u1, 1e-6))) * cos(6.28318 * u2);
  let luma_noise = gauss * intensity * 1.8;

  // Chrominance noise (weaker, per-channel)
  let chroma = (hash3(fc + vec2<f32>(31.7)) - 0.5) * intensity;

  col += vec3<f32>(luma_noise) + chroma;
  col = max(col, vec3<f32>(0.0));

  textureStore(output_tex, coord, vec4<f32>(col, 1.0));
}
