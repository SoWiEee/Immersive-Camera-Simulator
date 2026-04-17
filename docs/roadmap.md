# 🚀 Development Roadmap

## Phase 1 — 核心管道

**目標：能上傳圖片、拿到 depth map、套上假效果**

- [ ] FastAPI 基本架構 + `/api/depth` endpoint
- [ ] Depth Pro 模型載入（含 CUDA fallback to CPU）
- [ ] Depth map 輸出為 16-bit PNG，base64 回傳
- [ ] Vue 3 專案初始化（Vite + TS + Pinia）
- [ ] 圖片上傳 UI + drag-and-drop
- [ ] WebGPU device 初始化 + feature detection（fallback 提示）
- [ ] 圖片 + depth map → GPU texture
- [ ] 第一個 shader：純 Gaussian blur（驗證管道通暢）

**里程碑**：上傳圖片後能看到深度分層模糊效果

---

## Phase 2 — 影像效果引擎

**目標：曝光三角全部可調，景深物理正確**

- [ ] `exposure.wgsl`：亮度、對比、色溫、飽和度
- [ ] `noise.wgsl`：ISO 雜訊（luminance channel，感光元件尺寸係數）
- [ ] `bokeh.wgsl`：depth-aware 分層卷積，圓形 kernel
- [ ] `motionBlur.wgsl`：方向 + 強度控制
- [ ] `vignette.wgsl`：焦段連動的暗角強度
- [ ] 曝光計算邏輯（`useCamera.ts`）
- [ ] 拍攝模式（M / A / S / P）自動計算邏輯
- [ ] 即時直方圖（WebGPU compute 讀取亮度分布）

**里程碑**：調整所有參數都有視覺上正確的即時反饋

---

## Phase 3 — 相機 UI 擬真化

**目標：操作手感接近真實相機**

- [ ] 光圈環元件（SVG，可拖轉，刻度卡頓感）
- [ ] 快門速度轉盤（標準檔位：1/4000, 1/2000 ... 1s, B）
- [ ] ISO 轉盤（100, 200, 400, 800, 1600, 3200, 6400, Auto）
- [ ] 觀景窗 HUD（f值 / 快門 / ISO / EV 條 / 對焦點）
- [ ] 對焦距離滑桿（連動 DoF 預覽）
- [ ] 焦段選擇（24 / 35 / 50 / 85 / 135mm 預設 + 自訂）
- [ ] 多邊形 bokeh kernel（光圈葉片數選擇）
- [ ] 模式轉盤動畫

**里程碑**：UI 截圖可辨識為相機介面

---

## Phase 4 — 細節打磨

**目標：Portfolio 展示品質**

- [ ] `chromAberr.wgsl`：色差（邊緣 RGB 通道偏移）
- [ ] 焦段 FOV 計算（正確的透視感知裁切）
- [ ] 感光元件尺寸選擇（FF / APS-C / MFT）
- [ ] 快門類型（機械 / 電子）音效
- [ ] 拍攝後「底片」效果（grain + 輕微色偏）
- [ ] 導出處理後照片
- [ ] 鍵盤快捷鍵（←/→ 調整當前參數）
- [ ] 效果對比（Before/After 滑桿）
- [ ] 使用說明 overlay（教學模式）
