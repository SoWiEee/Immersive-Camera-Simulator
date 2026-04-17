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

- [ ] `exposure.wgsl`：亮度、對比、色溫、飽和度
- [ ] `noise.wgsl`：ISO 雜訊（sensor-aware：luminance + chrominance，依感光元件物理尺寸調整係數）
- [ ] `bokeh.wgsl`：depth-aware 分層卷積，圓形 kernel + `depthWeightedBlend`（抑制 edge bleeding）
- [ ] `motionBlur.wgsl`：方向 + 強度控制
- [ ] `vignette.wgsl`：焦段連動的暗角強度
- [ ] 曝光計算邏輯（`useCamera.ts`）
- [ ] 拍攝模式（M / A / S / P）自動計算邏輯
- [ ] 即時直方圖（WebGPU compute 讀取亮度分布）
- [ ] `data/sensors.ts`：感光元件資料庫（FF / APS-C 1.5x / APS-C 1.6x / M43 / 1-inch 的物理尺寸、CoC、noise curve 係數）
- [ ] `useSensor.ts`：crop factor、等效焦距換算、CoC 計算

**里程碑**：調整所有參數都有視覺上物理正確的即時反饋

---

## Phase 3 — 殺手鐧 × 相機 UI

**目標：雙畫面對比 + 感光元件/鏡頭系統 + 擬真介面**

### 殺手鐧功能

- [ ] `CompareView`：左右分割畫面，左側固定手機基準 pipeline，右側單眼模擬 pipeline，分割線可拖動
- [ ] 手機基準 pipeline 參數（小感光元件、大景深、手機 noise curve，固定不讓使用者調整）
- [ ] 參數教學 HUD：每個參數旁顯示即時物理意義說明（調光圈時說明景深變化、調 ISO 顯示訊雜比估算）
- [ ] `SensorSelector`：感光元件型號選擇，連動顯示等效焦距換算結果
- [ ] `useCompare.ts`：雙 pipeline 狀態管理（分割位置、手機基準渲染參數）

### 鏡頭系統

- [ ] `data/lenses.ts`：鏡頭資料庫（光圈葉片數、bokeh 形狀偏差、vignette profile、色差強度）
- [ ] `LensSelector`：名鏡預設選擇 UI（Zeiss Otus 55mm f/1.4、Canon 85mm f/1.2L、Helios 44-2 58mm f/2 等）
- [ ] `useLens.ts`：鏡頭特性參數管理，傳入 bokeh + vignette + chromAberr shader
- [ ] `bokeh.wgsl` 更新：多邊形 kernel（光圈葉片形狀）+ 焦外旋轉感（Helios swirl）

### 相機 UI

- [ ] 光圈環元件（SVG，可拖轉，刻度卡頓感）
- [ ] 快門速度轉盤（標準檔位：1/4000, 1/2000 … 1s, B）
- [ ] ISO 轉盤（100, 200, 400, 800, 1600, 3200, 6400, Auto）
- [ ] 觀景窗 HUD（f 值 / 快門 / ISO / EV 條）
- [ ] 對焦點選擇：點擊畫面選取對焦位置，即時更新銳利深度層（從 depth texture 讀取該點深度值）
- [ ] 焦段選擇（24 / 35 / 50 / 85 / 135mm 預設 + 自訂）

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
