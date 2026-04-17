# 📐 Camera Physics Model

## 曝光三角

```math
\text{EV} = \log_2(\frac{N^2}{t}) - \log_2(\frac{ISO}{100})
```

- N   = 光圈值 (f-number)，例如 f/2.8
- t   = 快門速度（秒），例如 1/500 = 0.002s
- ISO = 感光度

目標 EV 由場景亮度決定，使用者偏離目標 EV 即產生過曝/欠曝

## 景深計算

```math
\text{DoF} = 2 \times u^2 \times N \times \frac{c}{f^2}
```

- u = 對焦距離 (m，來自使用者滑桿)
- N = 光圈值
- c = 模糊圈直徑 (circle of confusion)，由感光元件尺寸決定
- f = 焦距 (mm)

模糊半徑 (pixel) = $|depth_pixel - focus_depth| \times bokeh_scale_factor(N, f)$

## Bokeh Kernel 形狀

光圈葉片數對應 kernel 形狀：
- 5 葉 → 五邊形
- 7 葉 → 七邊形  
- 9 葉（圓形） → 圓形（高 f-number 接近圓形）
- 自訂：可在 UI 選擇葉片數

## 📸 Simulated Camera Parameters

| 參數 | 範圍 | 說明 |
|---|---|---|
| 光圈 | f/1.0 – f/22 | 影響景深 + 曝光 |
| 快門速度 | 1/4000s – 30s + B | 影響動態模糊 + 曝光 |
| ISO | 50 – 102400 | 影響雜訊 + 曝光 |
| 焦距 | 14mm – 600mm | 影響 FOV + 暗角 + 景深 |
| 對焦距離 | 0.3m – ∞ | 影響景深平面位置 |
| 感光元件 | FF / APS-C / MFT | 影響 DoF 計算係數 |
| 光圈葉片 | 5 / 7 / 9 片 | 影響 bokeh 形狀 |