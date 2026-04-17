// bokeh.wgsl — depth-aware bokeh with polygon aperture shape + Helios swirl

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
@group(0) @binding(1) var depth_tex:  texture_2d<f32>; // r32float, unfilterable
@group(0) @binding(2) var output_tex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var<uniform>   params: CameraParams;

const NUM_SAMPLES:  i32 = 32;
const GOLDEN_ANGLE: f32 = 2.39996323; // 2π × (1 - 1/φ)
const PI:           f32 = 3.14159265;
const TAU:          f32 = 6.28318530;
// Hard cap from spec (GTX 1650 Ti performance budget)
const MAX_BLUR:     f32 = 64.0;

// Returns a [0,1] weight: 1 fully inside the n-gon, 0 outside.
// r_norm is radius normalized to blur_radius (0–1).
// n < 3 → circular aperture (always 1).
fn ngon_weight(r_norm: f32, theta: f32, n: u32, rotation: f32) -> f32 {
  if (n < 3u) { return 1.0; }
  let section = TAU / f32(n);
  // angle within the current sector, shifted to [-section/2, section/2]
  let t = ((theta - rotation) % section + section) % section - section * 0.5;
  // distance from center to the polygon edge at this angle (polygon inscribed in unit circle)
  let edge_r = cos(section * 0.5) / cos(t);
  return smoothstep(edge_r + 0.04, edge_r - 0.04, r_norm);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let coord = vec2<i32>(gid.xy);
  if (coord.x >= i32(params.width) || coord.y >= i32(params.height)) { return; }

  let center_col   = textureLoad(input_tex, coord, 0).rgb;
  let center_depth = textureLoad(depth_tex,  coord, 0).r;

  let depth_delta = abs(center_depth - params.focus_depth);
  let blur_radius = min(depth_delta * params.bokeh_scale, MAX_BLUR);

  // Sharp enough: skip convolution
  if (blur_radius < 0.5) {
    textureStore(output_tex, coord, vec4<f32>(center_col, 1.0));
    return;
  }

  var color_sum  = vec3<f32>(0.0);
  var weight_sum = 0.0;

  for (var i: i32 = 0; i < NUM_SAMPLES; i++) {
    let fi = f32(i) + 0.5;
    // Fibonacci spiral: uniform disc coverage
    let r_norm = sqrt(fi / f32(NUM_SAMPLES));
    let r      = r_norm * blur_radius;
    let theta  = fi * GOLDEN_ANGLE;

    // Polygon aperture mask (applied on unswirled theta for correct shape)
    let poly_w = ngon_weight(r_norm, theta, params.blade_count, params.blade_rotation);
    if (poly_w < 0.01) { continue; }

    // Swirl: additional rotation proportional to r_norm² (Helios-style swirl)
    let swirled_theta = theta + params.swirl_strength * r_norm * r_norm * TAU;
    let offset = vec2<f32>(cos(swirled_theta), sin(swirled_theta)) * r;

    let sc = clamp(
      coord + vec2<i32>(round(offset)),
      vec2<i32>(0),
      vec2<i32>(i32(params.width) - 1, i32(params.height) - 1),
    );

    let sample_depth = textureLoad(depth_tex,  sc, 0).r;
    let sample_col   = textureLoad(input_tex,  sc, 0).rgb;

    // Depth-weighted blend: suppress foreground color bleeding into background.
    // If the sample is significantly closer than center, downweight it.
    let depth_diff = sample_depth - center_depth;
    let depth_w = smoothstep(-0.1, 0.0, depth_diff);

    let w = depth_w * poly_w;
    color_sum  += sample_col * w;
    weight_sum += w;
  }

  let result = color_sum / max(weight_sum, 0.001);
  textureStore(output_tex, coord, vec4<f32>(result, 1.0));
}
