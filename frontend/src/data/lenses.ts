export interface LensProfile {
  id: string;
  name: string;
  brand: string;
  focalLength: number; // mm
  maxAperture: number; // minimum f-number (e.g. 1.4)
  minAperture: number; // maximum f-number (e.g. 22)
  bladeCount: number; // aperture blade count (0 = circular iris)
  bladeRotation: number; // initial aperture polygon rotation (radians)
  swirlStrength: number; // 0 = none, 1 = strong Helios-style swirl
  chromAberrStrength: number; // 0–1 chromatic aberration intensity
  vignetteProfile: number; // base vignette strength at max aperture (0–1)
  bokehShape: "circle" | "polygon" | "swirl";
  characterNote: string; // teaching HUD text
}

export const LENSES: LensProfile[] = [
  {
    id: "canon-rf-50-1.8",
    name: "RF 50mm f/1.8 STM",
    brand: "Canon",
    focalLength: 50,
    maxAperture: 1.8,
    minAperture: 22,
    bladeCount: 9,
    bladeRotation: 0.0,
    swirlStrength: 0.0,
    chromAberrStrength: 0.05,
    vignetteProfile: 0.28,
    bokehShape: "circle",
    characterNote:
      "無反時代最親民的標準鏡。9 葉圓形光圈讓散景球近乎完美圓形，現代鍍膜使色差控制優於舊款 EF 版，是 RF 系統入門的首選。",
  },
  {
    id: "nikon-z-40-2",
    name: "NIKKOR Z 40mm f/2",
    brand: "Nikon",
    focalLength: 40,
    maxAperture: 2.0,
    minAperture: 22,
    bladeCount: 9,
    bladeRotation: 0.0,
    swirlStrength: 0.0,
    chromAberrStrength: 0.04,
    vignetteProfile: 0.2,
    bokehShape: "circle",
    characterNote:
      "超薄餅鏡設計，攜帶幾乎無感。40mm 視角略廣於標準 50mm，更適合日常隨拍。9 葉光圈散景柔順，暗角表現出色地低。",
  },
  {
    id: "fuji-xf-35-2",
    name: "XF 35mm f/2 R WR",
    brand: "Fujifilm",
    focalLength: 35,
    maxAperture: 2.0,
    minAperture: 16,
    bladeCount: 9,
    bladeRotation: 0.05,
    swirlStrength: 0.0,
    chromAberrStrength: 0.06,
    vignetteProfile: 0.3,
    bokehShape: "circle",
    characterNote:
      "APS-C 等效 53mm，防塵防滴，是 Fuji 街拍玩家的隨身標配。9 葉光圈、Fuji 特有的色彩調性，加上輕巧機身讓每次出門都毫無負擔。",
  },
  {
    id: "sony-fe-50-1.8",
    name: "FE 50mm f/1.8",
    brand: "Sony",
    focalLength: 50,
    maxAperture: 1.8,
    minAperture: 22,
    bladeCount: 7,
    bladeRotation: 0.2,
    swirlStrength: 0.0,
    chromAberrStrength: 0.1,
    vignetteProfile: 0.35,
    bokehShape: "polygon",
    characterNote:
      "Sony E-mount 使用者最常見的第一支定焦。7 葉光圈在大光圈時散景球略帶多邊形，色差比高階鏡稍明顯，但優異的性價比讓它廣受新手歡迎。",
  },
  {
    id: "sony-fe-85-1.8",
    name: "FE 85mm f/1.8",
    brand: "Sony",
    focalLength: 85,
    maxAperture: 1.8,
    minAperture: 22,
    bladeCount: 9,
    bladeRotation: 0.0,
    swirlStrength: 0.0,
    chromAberrStrength: 0.05,
    vignetteProfile: 0.25,
    bokehShape: "circle",
    characterNote:
      "平價人像鏡中的標竿之作。85mm 黃金焦距搭配 f/1.8 大光圈，9 葉光圈打造圓潤奶油感散景，色差控制媲美高階款，是人像攝影入門的絕佳選擇。",
  },
  {
    id: "sigma-56-1.4-dc-dn",
    name: "56mm f/1.4 DC DN Contemporary",
    brand: "Sigma",
    focalLength: 56,
    maxAperture: 1.4,
    minAperture: 16,
    bladeCount: 9,
    bladeRotation: 0.0,
    swirlStrength: 0.0,
    chromAberrStrength: 0.04,
    vignetteProfile: 0.22,
    bokehShape: "circle",
    characterNote:
      "APS-C 等效 84mm，專為 Sony E / Fuji X / L-mount APS-C 設計。f/1.4 超大光圈、9 葉圓形光圈，帶來媲美全幅人像鏡的散景表現，Art 系列光學品質的平民版。",
  },
];

export const DEFAULT_LENS_ID = "canon-rf-50-1.8";
