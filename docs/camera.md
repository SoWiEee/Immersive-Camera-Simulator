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

- u = 對焦距離 (m，來自使用者滑桿或點擊對焦點)
- N = 光圈值
- c = CoC (mm)，由當前選擇的感光元件決定
- f = 焦距 (mm)

**像素模糊半徑**：

```
blur_radius (px) = |depth_pixel - focus_depth| × bokeh_scale_factor(N, f, sensor)
```

其中 `bokeh_scale_factor` 同時受光圈、焦距、感光元件 CoC 影響，確保不同感光元件在相同等效參數下產生相同景深。

### 對焦點選擇

使用者點擊 CompareView 右側畫面的任意位置時：
1. 從 depth texture 讀取該像素的深度值（公尺）
2. 將此深度值設為 `focus_depth`
3. Bokeh shader 依 `|depth - focus_depth|` 重新計算每個像素的模糊半徑
4. 左側手機 pipeline 的 `focus_depth` 同步更新（但 CoC 保持手機基準值）

---

## Bokeh Kernel 形狀

光圈葉片數對應 kernel 形狀：

| 葉片數 | 形狀 | 代表鏡頭 |
|---|---|---|
| 5 葉 | 五邊形 | 早期日系鏡頭 |
| 7 葉 | 七邊形 | Canon L 系列（部分） |
| 9 葉（圓形） | 圓形 | 現代高端鏡頭，高 f-number 接近圓形 |
| 自訂渦旋 | 旋轉橢圓 | Helios 44-2（swirl bokeh） |

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
  name: string            // 顯示名稱，例如 "Helios 44-2 58mm f/2"
  focalLength: number     // 焦距 (mm)
  maxAperture: number     // 最大光圈 f-number
  blades: number          // 光圈葉片數
  bokehShape: 'circle' | 'polygon' | 'swirl'
  swirlStrength?: number  // Helios 渦旋強度（0–1）
  vignetteProfile: number // 暗角強度係數（0–1）
  chromaProfile: number   // 色差強度係數（0–1）
  characterNote: string   // 給教學 HUD 顯示的鏡頭個性說明
}
```

### 內建名鏡預設

| 鏡頭 | 特性 |
|---|---|
| Zeiss Otus 55mm f/1.4 | 9 葉圓形 bokeh，極低色差，現代感 |
| Canon EF 85mm f/1.2L | 8 葉，焦外奶油感，輕微色差 |
| Helios 44-2 58mm f/2 | 8 葉，渦旋 swirl bokeh，復古色調 |
| Nikkor 50mm f/1.8G | 7 葉，均衡表現，平易近人 |

---

## 手機基準 Pipeline 參數

左側對比畫面固定使用以下參數（不受使用者控制）：

| 參數 | 值 | 說明 |
|---|---|---|
| 感光元件 | 1/1.7"（手機旗艦級） | CoC = 0.006mm |
| 光圈 | f/1.8（等效全幅 f/8.6） | 幾乎全景深 |
| 焦距 | 等效 26mm | 手機廣角主鏡頭 |
| ISO noise curve | 手機 CMOS 特性 | chrominance noise 更明顯 |
| 後處理 | 關閉（展示純感光元件差異） | 不加 AI 去噪模擬 |

---

## 相機參數範圍

| 參數 | 範圍 | 說明 |
|---|---|---|
| 光圈 | f/1.0 – f/22 | 影響景深 + 曝光 + bokeh 形狀 |
| 快門速度 | 1/4000s – 30s + B | 影響動態模糊 + 曝光 |
| ISO | 50 – 102400 | 影響雜訊強度 + 曝光 |
| 焦距 | 14mm – 600mm | 影響 FOV 裁切 + 暗角 + 景深 |
| 對焦距離 | 0.3m – ∞ | 影響景深平面位置（Depth Pro 提供公尺單位） |
| 感光元件 | FF / APS-C / M43 / 1-inch | 影響 CoC + 等效焦距 + 等效光圈 + noise curve |
| 光圈葉片 | 5 / 7 / 9 / swirl | 影響 bokeh 形狀（由鏡頭 profile 決定） |
