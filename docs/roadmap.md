# 🚀 Development Roadmap

## Phase 1 — 核心管道

**目標：能上傳圖片、拿到 depth map、套上基本效果**

- [x] FastAPI 基本架構 + `/api/depth` endpoint
- [x] Depth Pro 模型載入（含 luminance fallback，無模型時仍可測試 pipeline）
- [x] Depth map 輸出為 16-bit PNG，base64 回傳
- [x] Vue 3 專案初始化（VitePlus + TS + Pinia）
- [x] 圖片上傳 UI + drag-and-drop
- [x] WebGPU device 初始化 + feature detection（fallback 提示）
- [x] 圖片 + depth map → GPU texture
- [x] 第一個 shader：純 Gaussian blur（驗證管道通暢）
- [x] IndexedDB 快取：SHA-256 hash → depth map，避免重整後重算

**里程碑**：上傳圖片後能看到深度分層模糊效果，第二次上傳相同圖片不需重算

---

## Phase 2 — 影像效果引擎

**目標：曝光三角全部可調，景深物理正確**

- [x] `exposure.wgsl`：亮度、對比、色溫、飽和度
- [x] `noise.wgsl`：ISO 雜訊（sensor-aware：luminance + chrominance，依感光元件物理尺寸調整係數）
- [x] `bokeh.wgsl`：depth-aware 分層卷積，Fibonacci spiral disc kernel + `depthWeightedBlend`（抑制 edge bleeding）
- [x] `motionBlur.wgsl`：方向 + 強度控制
- [x] `vignette.wgsl`：焦段連動的暗角強度 + 輕微色差
- [x] 曝光計算邏輯（cameraStore 內建 EV₁₀₀ / evAdjusted / exposureDelta computed）
- [x] 拍攝模式（M / A / S / P）自動計算邏輯（autoComputeExposure）
- [ ] 即時直方圖（WebGPU compute 讀取亮度分布）
- [x] `data/sensors.ts`：感光元件資料庫（FF / APS-C 1.5x / APS-C 1.6x / M43 / 1-inch 的物理尺寸、CoC、noise curve 係數）
- [x] `useSensor.ts`：crop factor、等效焦距換算、CoC 計算

**里程碑**：調整所有參數都有視覺上物理正確的即時反饋

---

## Phase 3 — 殺手鐧 × 相機 UI

**目標：雙畫面對比 + 感光元件/鏡頭系統 + 擬真介面**

### 殺手鐧功能

- [x] `CompareView`：左右分割畫面，左側固定手機基準 pipeline，右側單眼模擬 pipeline，分割線可拖動
- [x] 手機基準 pipeline 參數（小感光元件、大景深、手機 noise curve，固定不讓使用者調整）
- [x] 參數教學 HUD：每個參數旁顯示即時物理意義說明（DoF 分類 + 等效全幅光圈 + 超焦距 + SNR + 安全快門）
- [x] `SensorSelector`：感光元件型號選擇，連動顯示等效焦距 + CoC（整合在 Viewfinder 側欄）
- [x] `useCompare.ts`：雙 pipeline 狀態管理（分割位置、手機基準渲染參數）

### 鏡頭系統

- [x] `data/lenses.ts`：鏡頭資料庫（光圈葉片數、bokeh 形狀偏差、vignette profile、色差強度）
- [x] `LensSelector`：現代無反入門鏡預設選擇 UI（Canon RF 50/1.8、Nikon Z 40/2、Fuji XF 35/2、Sony FE 50/1.8、Sony FE 85/1.8、Sigma 56/1.4 DC DN）
- [x] `bokeh.wgsl` 更新：多邊形 kernel（光圈葉片形狀）

### 相機 UI

- [x] 光圈環元件（SVG，可拖轉，270° 弧刻度，snap 至最近檔位）
- [x] 快門速度撥輪（DialWheel，標準檔位：1/4000 ~ 30s，scroll-snap）
- [x] ISO 撥輪（DialWheel，100 ~ 25600 標準檔位）
- [x] 觀景窗 HUD（f 值 / 快門 / ISO / EV 條）已在 Phase 2 完成
- [x] 對焦點選擇：點擊畫面選取對焦位置（已在 Phase 2 完成）
- [x] 焦段選擇（24 / 28 / 35 / 50 / 58 / 85 / 135 / 200mm 預設 + 滑桿自訂）
- [x] 重設相機參數按鈕（復原到景深推算完成狀態）

**里程碑**：主要差異化功能完整，可對外展示

---

## Phase 4 — 細節打磨

**目標：Portfolio 展示品質**

- [ ] `chromAberr.wgsl`：色差（邊緣 RGB 通道偏移，依鏡頭 profile 調整強度）
- [ ] 焦段 FOV 計算（正確的透視感知裁切，連動感光元件 crop factor）
- [ ] 快門類型（機械 / 電子）音效
- [ ] 拍攝後「底片」效果（grain + 輕微色偏）
- [ ] 導出處理後照片
- [ ] 鍵盤快捷鍵（←/→ 調整當前參數）
- [ ] 模式轉盤動畫
