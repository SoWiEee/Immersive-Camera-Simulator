# 🚀 Development Roadmap

> 分支 `3d-interactive`：從 2D 單張照片模擬升級為 3D 場景重建 + 虛擬相機漫遊。
> `main` 分支的相機 UI、WGSL shader、感光元件/鏡頭系統已完成，在此分支直接沿用。

---

## 已完成（繼承自 main 分支）

- [x] Vue 3 專案初始化（VitePlus + TS + Pinia）
- [x] WebGPU device 初始化 + feature detection（fallback 提示）
- [x] `exposure.wgsl`：亮度、對比、色溫、飽和度
- [x] `noise.wgsl`：ISO 雜訊（sensor-aware：luminance + chrominance）
- [x] `bokeh.wgsl`：depth-aware 分層卷積，Fibonacci spiral disc kernel + `depthWeightedBlend`
- [x] `motionBlur.wgsl`：方向 + 強度控制
- [x] `vignette.wgsl`：焦段連動的暗角強度 + 輕微色差
- [x] 曝光計算邏輯（EV₁₀₀ / evAdjusted / exposureDelta computed）
- [x] 拍攝模式（M / A / S / P）自動計算邏輯
- [x] `data/sensors.ts`：感光元件資料庫（FF / APS-C / M43 / 1-inch / phone）
- [x] `data/lenses.ts`：現代無反入門鏡資料庫（Canon RF / Nikon Z / Fuji XF / Sony FE / Sigma DC DN）
- [x] 控制面板浮層 UI（玻璃感、可拖動、透明度滑桿）
- [x] 光圈環元件（SVG，270° 弧刻度，snap）
- [x] 快門 / ISO 兩列按鈕格（標準檔位）
- [x] 觀景窗 HUD（f 值 / 快門 / ISO / EV 條）
- [x] `CompareView`：左右分割對比，分割線可拖動
- [x] 手機基準 pipeline 固定參數
- [x] 參數教學 HUD

---

## Phase 1 — 3D 重建後端 ✅

**目標：影片上傳後能取得可用於渲染的 .splat 場景**

- [x] FastAPI 重建 job 架構（asyncio.Lock 保護的 JobStore）
- [x] `POST /api/reconstruct`：接收影片、建立重建 job（202 Accepted）
- [x] `GET /api/reconstruct/{job_id}`：輪詢進度
- [x] ffmpeg-python 影片抽幀（可配置 fps / 最大幀數）
- [x] COLMAP SfM 整合：相機位姿估算 + 稀疏點雲
- [x] gsplat 3DGS 訓練整合：讀入 COLMAP 結果 → 輸出 .ply
- [x] 場景快取：依影片 SHA-256 hash 存放 `backend/scenes/{hash}/`
- [x] `GET /api/reconstruct/{job_id}/result`：下載 .ply 檔案
- [x] `GET /api/health`：回傳 GPU / CUDA / COLMAP / ffmpeg 狀態

---

## Phase 2 — 3D 場景前端渲染 ✅

**目標：在瀏覽器中即時渲染 3DGS 場景並能移動相機**

- [x] 整合 GaussianSplats3D（@mkkellogg/gaussian-splats-3d）到 Vue 3 元件
- [x] `SceneViewer.vue`：載入 .ply → Three.js 渲染迴圈
- [x] Orbit 相機控制（沿用 GS3D 內建 controls）
- [x] FPS 相機控制（Pointer Lock API + WASD + Space/Shift）
- [x] 切換控制模式（Orbit / FPS toggle）
- [x] `VideoUpload.vue`：影片上傳 UI + 重建進度條（3 秒輪詢 + AbortController）
- [x] `useScene.ts`：場景載入狀態、控制模式、清理生命週期

---

## Phase 3 — 相機效果整合

**目標：3DGS 渲染幀接入現有 WebGPU post-processing pipeline**

### 3.1 已完成

- [x] cameraStore 新增虛擬相機位姿（position / quaternion）+ 效果開關
- [x] `CamSimPipeline` 重構：支援逐幀 canvas / ImageBitmap 來源（取代靜態 File）
- [x] `useEffects.ts`：以 RAF 為節拍從 GS3D canvas 抓幀 → WebGPU pipeline → 輸出 canvas
- [x] `SceneViewer` 加入「模擬效果」切換 + 效果輸出 canvas 疊層
- [x] 點擊場景對焦：Three.js Raycaster → splat scene plane → focus distance（公尺）
- [x] 非 depth 相關 shader（exposure / noise / vignette / motionBlur）完整接入

### 3.2 已知限制

3DGS 渲染管線（`@mkkellogg/gaussian-splats-3d`）不對外輸出 per-pixel depth buffer。
目前 bokeh pass 暫以「相機到對焦點距離」當作整幀均勻深度（單一 z），
因此散景在 3D 場景中會表現為均勻模糊而非真正的景深分層。
要做到 main 分支 2D 模式那種精準景深，需要：

- **方案 A**：fork `@mkkellogg/gaussian-splats-3d` 並在其 `splatMesh` shader 中額外輸出深度 attachment（最乾淨但要維護 fork）。
- **方案 B**：每幀於 3DGS 主畫面之外另跑一次 `THREE.Points` depth-only render pass（成本：再排序一次 Gaussians，FPS 折半）。
- **方案 C**：對 `splatMesh` 抽樣 N×N 網格 raycast，產生低解析度深度圖（成本：每點都要 traverse splats）。

→ 本項作為 Phase 4 的延伸研究主題，不在本 phase 內鎖定。

---

---

## Phase 4 — 細節打磨

**目標：Portfolio 展示品質**

- [ ] **真實 per-pixel 深度**（採方案 A/B/C 之一，見 Phase 3.2）→ 接回 depth-aware bokeh
- [ ] `CompareView` 適配：同 3DGS 視角 × 雙 pipeline（手機 vs 單眼）+ 拖動分割線
- [ ] `chromAberr.wgsl`：色差（邊緣 RGB 通道偏移，依鏡頭 profile 調整強度）
- [ ] 焦段 FOV 計算（正確的透視感知裁切，連動感光元件 crop factor）
- [ ] 即時直方圖（WebGPU compute 讀取亮度分布）
- [ ] 導出當前視角處理後照片（Canvas `toBlob` → 下載）
- [ ] 鍵盤快捷鍵（←/→ 微調當前參數）
- [ ] 重建進度詳細顯示（COLMAP 階段 / 3DGS 訓練 iteration）
- [ ] 快門音效（機械 / 電子切換）
