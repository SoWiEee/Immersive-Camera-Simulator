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
    id: "canon-50-1.8",
    name: "EF 50mm f/1.8 STM",
    brand: "Canon",
    focalLength: 50,
    maxAperture: 1.8,
    minAperture: 22,
    bladeCount: 7,
    bladeRotation: 0.22,
    swirlStrength: 0.0,
    chromAberrStrength: 0.15,
    vignetteProfile: 0.38,
    bokehShape: "polygon",
    characterNote:
      "平民 50mm 的定番之選。7 葉光圈在大光圈下呈現稍微偏多邊形的散景球，色差略明顯，但高性價比讓它成為入門標準鏡首選。",
  },
  {
    id: "zeiss-otus-55",
    name: "Otus 55mm f/1.4",
    brand: "Zeiss",
    focalLength: 55,
    maxAperture: 1.4,
    minAperture: 16,
    bladeCount: 9,
    bladeRotation: 0.0,
    swirlStrength: 0.0,
    chromAberrStrength: 0.02,
    vignetteProfile: 0.2,
    bokehShape: "circle",
    characterNote:
      "頂級 APO 消色差設計，9 葉光圈接近正圓。色差控制達到極致，散景球形純淨，是目前光學素質最高的 55mm 鏡頭之一。",
  },
  {
    id: "canon-85-1.2l",
    name: "EF 85mm f/1.2L II",
    brand: "Canon",
    focalLength: 85,
    maxAperture: 1.2,
    minAperture: 16,
    bladeCount: 8,
    bladeRotation: 0.1,
    swirlStrength: 0.0,
    chromAberrStrength: 0.08,
    vignetteProfile: 0.48,
    bokehShape: "circle",
    characterNote:
      "「夢幻奶油」的代名詞。f/1.2 超大光圈配合 8 葉接近圓形的光圈，前後景皆化為柔美的奶油質感。大光圈下有明顯暗角，反而增加氛圍感。",
  },
  {
    id: "helios-44-2",
    name: "Helios 44-2 58mm f/2",
    brand: "KMZ",
    focalLength: 58,
    maxAperture: 2.0,
    minAperture: 16,
    bladeCount: 8,
    bladeRotation: 0.0,
    swirlStrength: 0.6,
    chromAberrStrength: 0.32,
    vignetteProfile: 0.52,
    bokehShape: "swirl",
    characterNote:
      "1950 年代蘇聯鏡頭傳奇。獨特的旋轉式散景（swirl）來自鏡片設計的球差特性，背景呈現螺旋漩渦感。色差明顯但賦予照片復古氛圍。",
  },
  {
    id: "sigma-35-1.4-art",
    name: "35mm f/1.4 DG HSM Art",
    brand: "Sigma",
    focalLength: 35,
    maxAperture: 1.4,
    minAperture: 16,
    bladeCount: 9,
    bladeRotation: 0.05,
    swirlStrength: 0.0,
    chromAberrStrength: 0.04,
    vignetteProfile: 0.25,
    bokehShape: "circle",
    characterNote:
      "現代 Art 系列旗艦。9 葉圓形光圈，色差極小，銳利度媲美 Zeiss。35mm 視角接近人眼，兼顧環境與主體，是紀實攝影的利器。",
  },
  {
    id: "nikkor-50-1.8g",
    name: "AF-S Nikkor 50mm f/1.8G",
    brand: "Nikon",
    focalLength: 50,
    maxAperture: 1.8,
    minAperture: 22,
    bladeCount: 7,
    bladeRotation: 0.15,
    swirlStrength: 0.0,
    chromAberrStrength: 0.12,
    vignetteProfile: 0.32,
    bokehShape: "polygon",
    characterNote:
      "Nikon F 接口的經典主力鏡。7 葉光圈表現均衡，色彩渲染偏向暖調，在人像與日常街拍場合有穩定發揮。",
  },
];

export const DEFAULT_LENS_ID = "canon-50-1.8";
