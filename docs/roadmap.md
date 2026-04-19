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

## Phase 1 — 3D 重建後端

**目標：影片上傳後能取得可用於渲染的 .splat 場景**

- [ ] FastAPI 重建 job 架構（非同步任務 + 進度回報）
- [ ] `POST /api/reconstruct`：接收影片、建立重建 job
- [ ] `GET /api/reconstruct/{job_id}`：輪詢進度（SSE 或 polling）
- [ ] ffmpeg-python 影片抽幀（可配置 fps / 最大幀數）
- [ ] COLMAP SfM 整合：相機位姿估算 + 稀疏點雲
- [ ] gsplat 3DGS 訓練整合：讀入 COLMAP 結果 → 輸出 .splat
- [ ] 場景快取：依影片 SHA-256 hash 存放 `backend/scenes/{hash}/`
- [ ] `GET /api/reconstruct/{job_id}/result`：下載 .splat 檔案
- [ ] `GET /api/health`：回傳 GPU / CUDA 狀態

**里程碑**：上傳影片後，後端完成重建並輸出 .splat，前端可下載

---

## Phase 2 — 3D 場景前端渲染

**目標：在瀏覽器中即時渲染 3DGS 場景並能移動相機**

- [ ] 整合 GaussianSplats3D（three-gaussian-splats）到 Vue 3 元件
- [ ] `SceneViewer.vue`：載入 .splat → Three.js 渲染迴圈
- [ ] Orbit 相機控制（滑鼠拖動旋轉、滾輪縮放）
- [ ] FPS 相機控制（鍵盤 WASD + 滑鼠看方向）
- [ ] 切換控制模式（Orbit / FPS toggle）
- [ ] `VideoUpload.vue`：影片上傳 UI + 重建進度條（輪詢 job 狀態）
- [ ] 從 Three.js render target 讀出 RGBA frame + depth buffer
- [ ] `useScene.ts`：場景載入狀態、相機位置/朝向、深度取樣

**里程碑**：可在重建好的場景中自由移動，frame 可輸出至下一 pipeline

---

## Phase 3 — 相機效果整合

**目標：3DGS 渲染幀接入現有 WebGPU post-processing pipeline**

- [ ] 將 Three.js render target 的 RGBA texture 匯入 WebGPU compute pipeline
- [ ] 深度資訊從 3DGS 場景幾何取得，替換原有 Depth Pro depth texture
- [ ] 點擊場景對焦：ray-scene intersection → 取得深度值 → 更新 `focus_depth`
- [ ] 左側手機基準 pipeline 接入同一渲染幀（共用 texture）
- [ ] 右側單眼模擬 pipeline：沿用 main 分支所有 WGSL shader
- [ ] `CompareView` 適配：從 2D 圖片比較改為同視角 + 不同相機設定比較
- [ ] cameraStore 新增虛擬相機位姿（position / quaternion）

**里程碑**：在 3D 場景中移動相機時，景深/散景/雜訊效果即時更新

---

## Phase 4 — 細節打磨

**目標：Portfolio 展示品質**

- [ ] `chromAberr.wgsl`：色差（邊緣 RGB 通道偏移，依鏡頭 profile 調整強度）
- [ ] 焦段 FOV 計算（正確的透視感知裁切，連動感光元件 crop factor）
- [ ] 即時直方圖（WebGPU compute 讀取亮度分布）
- [ ] 導出當前視角處理後照片（Canvas `toBlob` → 下載）
- [ ] 鍵盤快捷鍵（←/→ 微調當前參數）
- [ ] 重建進度詳細顯示（COLMAP 階段 / 3DGS 訓練 iteration）
- [ ] 快門音效（機械 / 電子切換）
