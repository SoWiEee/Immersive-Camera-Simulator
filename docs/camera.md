# 📐 Camera Physics Model

## 曝光三角

```math
\text{EV} = \log_2(\frac{N^2}{t}) - \log_2(\frac{ISO}{100})
```

- N   = 光圈值 (f-number)，例如 f/2.8
- t   = 快門速度（秒），例如 1/500 = 0.002s
- ISO = 感光度

目標 EV 由場景亮度決定，使用者偏離目標 EV 即產生過曝/欠曝。

---

## 感光元件系統

### 尺寸與 Crop Factor

| 感光元件 | 物理尺寸 (mm) | Crop Factor | CoC (mm) |
|---|---|---|---|
| 全幅 (FF) | 36 × 24 | 1.0x | 0.030 |
| APS-C（Sony / Nikon） | 23.5 × 15.6 | 1.5x | 0.020 |
| APS-C（Canon） | 22.3 × 14.9 | 1.6x | 0.019 |
| M43（Micro Four Thirds） | 17.3 × 13 | 2.0x | 0.015 |
| 1-inch | 13.2 × 8.8 | 2.7x | 0.011 |
| 手機基準（1/1.7"） | 7.6 × 5.7 | 4.8x | 0.006 |

**等效焦距換算**：`等效焦距 = 實際焦距 × crop factor`
例：50mm 鏡頭裝在 APS-C 上 = 75mm 全幅等效視角

**等效光圈換算**（景深等效）：`等效光圈 = 實際光圈 × crop factor`
例：APS-C f/2.8 的景深 ≈ 全幅 f/4.2

### CoC（Circle of Confusion）

CoC 由感光元件對角線長度決定，通用公式：

```
CoC (mm) = sensor_diagonal (mm) / 1500
```

這是「可接受銳利度」的臨界模糊圈直徑，用於計算景深範圍。

---

## 景深計算

```math
\text{DoF} = 2 \times u^2 \times N \times \frac{c}{f^2}
```

- u = 對焦距離 (m，來自 3DGS 場景幾何深度或使用者滑桿)
- N = 光圈值
- c = CoC (mm)，由當前選擇的感光元件決定
- f = 焦距 (mm)

**像素模糊半徑**：

```
blur_radius (px) = |depth_pixel - focus_depth| × bokeh_scale_factor(N, f, sensor)
```

其中 `bokeh_scale_factor` 同時受光圈、焦距、感光元件 CoC 影響，確保不同感光元件在相同等效參數下產生相同景深。

### 對焦點選擇（3D 場景版本）

使用者點擊 SceneViewer 畫面的任意位置時：

1. 從 Three.js depth buffer 讀取該像素的深度值（NDC 轉換為線性深度）
2. 反投影至世界座標，計算與相機的距離（公尺）
3. 將此距離設為 `focus_depth`（公尺單位）
4. Bokeh shader 依 `|depth - focus_depth|` 重新計算每個像素的模糊半徑
5. 左右兩側 pipeline 的 `focus_depth` 同步更新（CoC 各自保持對應感光元件值）

> **深度來源差異（vs main 分支）**：main 分支使用 Depth Pro 估算的 depth texture（相對深度值 0–1），需正規化。3d-interactive 分支的深度直接來自 3DGS 場景幾何（真實公尺單位），與 DoF 公式直接對應，物理更正確。

---

## Bokeh Kernel 形狀

光圈葉片數對應 kernel 形狀：

| 葉片數 | 形狀 | 代表鏡頭 |
|---|---|---|
| 7 葉 | 七邊形 | Sony FE 50mm f/1.8（稍具特色的多邊形散景） |
| 9 葉（近圓形） | 圓形 | Canon RF 50/1.8、Nikon Z 40/2、Fuji XF 35/2、Sony FE 85/1.8、Sigma 56/1.4 |
| 自訂渦旋 | 旋轉橢圓 | 保留欄位供特殊鏡頭擴充 |

Bokeh kernel 在 `bokeh.wgsl` 中以 Three.js TSL 計算多邊形形狀後傳入，效能敏感的卷積本體為原生 WGSL compute shader。

### Edge Bleeding 抑制（depthWeightedBlend）

分層 bokeh 在前背景邊界會有前景色彩滲入背景模糊（leakage artifact）。處理方式：
1. 每個 depth 層卷積前乘上 sigmoid 柔化的 depth mask
2. 卷積後以 depth 距離反比做加權合成
3. 最終以 `depthWeightedBlend` 函式合層

---

## 鏡頭 Profile 系統

每顆鏡頭在 `data/lenses.ts` 中定義以下參數：

```ts
interface LensProfile {
  id: string              // 唯一識別 ID
  name: string            // 顯示名稱，例如 "RF 50mm f/1.8 STM"
  brand: string           // 品牌
  focalLength: number     // 焦距 (mm)
  maxAperture: number     // 最大光圈 f-number
  minAperture: number     // 最小光圈 f-number
  bladeCount: number      // 光圈葉片數（0 = 圓形虹膜）
  bladeRotation: number   // 初始多邊形旋轉角（radians）
  swirlStrength: number   // 渦旋強度（0–1，保留供特殊鏡頭擴充）
  chromAberrStrength: number // 色差強度係數（0–1）
  vignetteProfile: number // 暗角強度係數（0–1）
  bokehShape: 'circle' | 'polygon' | 'swirl'
  characterNote: string   // 教學 HUD 顯示的鏡頭個性說明
}
```

### 內建鏡頭預設

| 鏡頭 | 系統 | 特性 |
|---|---|---|
| Canon RF 50mm f/1.8 STM | RF (FF) | 9 葉圓形，現代無反入門標準鏡 |
| Nikon Z 40mm f/2 | Z (FF) | 9 葉，超薄餅鏡，低暗角 |
| Fujifilm XF 35mm f/2 R WR | X (APS-C) | 9 葉，防塵防水，街拍首選 |
| Sony FE 50mm f/1.8 | E (FF) | 7 葉多邊形，E-mount 入門定焦 |
| Sony FE 85mm f/1.8 | E (FF) | 9 葉，平價人像鏡標竿 |
| Sigma 56mm f/1.4 DC DN | APS-C 通用 | 9 葉，APS-C 人像鏡首選 |

---

## 手機基準 Pipeline 參數

左側對比畫面固定使用以下參數（不受使用者控制）：

| 參數 | 值 | 說明 |
|---|---|---|
| 感光元件 | 1/1.7"（手機旗艦級） | CoC = 0.006mm |
| 光圈 | f/1.8（等效全幅 f/8.6） | 幾乎全景深 |
| 焦距 | 等效 26mm | 手機廣角主鏡頭 |
| ISO noise curve | 手機 CMOS 特性 | chrominance noise 更明顯 |
| 後處理 | 簡化版（無 chromAberr / motionBlur） | 展示純感光元件差異 |

---

## 相機參數範圍

| 參數 | 範圍 | 說明 |
|---|---|---|
| 光圈 | f/1.0 – f/22 | 影響景深 + 曝光 + bokeh 形狀 |
| 快門速度 | 1/4000s – 30s + B | 影響動態模糊 + 曝光 |
| ISO | 50 – 102400 | 影響雜訊強度 + 曝光 |
| 焦距 | 14mm – 600mm | 影響 FOV 裁切 + 暗角 + 景深 |
| 對焦距離 | 0.3m – ∞ | 從 3DGS 場景幾何取得（公尺單位） |
| 感光元件 | FF / APS-C / M43 / 1-inch | 影響 CoC + 等效焦距 + 等效光圈 + noise curve |
| 光圈葉片 | 7 / 9 / swirl | 影響 bokeh 形狀（由鏡頭 profile 決定） |
| Bokeh kernel size | 1px – 64px | 超過 64px 在 GTX 1650 Ti 上掉幀 |
