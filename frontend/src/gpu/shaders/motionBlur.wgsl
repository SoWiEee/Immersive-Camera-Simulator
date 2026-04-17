// motionBlur.wgsl — linear directional motion blur

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

const SAMPLES: i32 = 12;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let coord = vec2<i32>(gid.xy);
  if (coord.x >= i32(params.width) || coord.y >= i32(params.height)) { return; }

  // Pass-through when motion blur is off
  if (params.motion_strength < 0.001) {
    textureStore(output_tex, coord, textureLoad(input_tex, coord, 0));
    return;
  }

  let dir = vec2<f32>(cos(params.motion_angle), sin(params.motion_angle));
  let max_dim = f32(max(params.width, params.height));
  let blur_len = params.motion_strength * max_dim * 0.04;

  var color_sum = vec3<f32>(0.0);
  for (var i: i32 = 0; i < SAMPLES; i++) {
    // Distribute samples symmetrically around center
    let t = (f32(i) / f32(SAMPLES - 1) - 0.5) * blur_len;
    let sc = clamp(
      coord + vec2<i32>(round(dir * t)),
      vec2<i32>(0),
      vec2<i32>(i32(params.width) - 1, i32(params.height) - 1),
    );
    color_sum += textureLoad(input_tex, sc, 0).rgb;
  }

  textureStore(output_tex, coord, vec4<f32>(color_sum / f32(SAMPLES), 1.0));
}
