# 📷 CamSim — Immersive Camera Simulator

> **在重建的 3D 場景裡移動虛擬相機，即時感受全幅鏡頭景深和手機鏡頭的差距。**

上傳一段影片，系統自動重建 3D 場景（3D Gaussian Splatting）。你可以在場景中任意移動虛擬相機位置、選擇感光元件與鏡頭，即時看到「手機拍出來的樣子」vs「用全幅單眼拍出來的樣子」——景深、散景、雜訊、色差，全部由物理模型驅動，不是套濾鏡。

**目標**：攝影教學工具 × Portfolio 技術展示。操作體驗接近真實相機，影像效果由 3D Gaussian Splatting + WebGPU compute shader 驅動。

- 開發路線圖：[docs/roadmap.md](/docs/roadmap.md)
- API 文件：[docs/api.md](/docs/api.md)
- 相機模擬設計：[docs/camera.md](/docs/camera.md)

---

## ✨ Features

### 3D 場景重建 + 虛擬相機漫遊

- **影片上傳 → 3D 重建**：上傳一段繞行或平移拍攝的影片，後端自動執行 COLMAP SfM + 3D Gaussian Splatting，輸出可即時渲染的 .splat 場景
- **自由移動相機位置**：在重建的 3D 場景中使用 Orbit / FPS 操控虛擬相機，任意選擇拍攝角度
- **場景快取**：相同影片的重建結果快取於後端，不重複訓練

### 雙畫面對比 + 參數教學模式

- **左右分割對比**：相同相機位置下，左側顯示「手機等效效果（小感光元件、大景深、低雜訊曲線）」，右側顯示「你設定的單眼參數效果」，拖動分割線即時對比
- **參數教學 HUD**：每個參數旁顯示即時文字解說——調整光圈時說明景深變化原理，調整 ISO 時顯示當前感光元件在此 ISO 的訊雜比估算

### 相機操作

- 擬真相機 UI：光圈環、快門按鈕格、ISO 按鈕格 + 數值 HUD
- 拍攝模式：Manual (M) / Aperture Priority (A) / Shutter Priority (S) / Program (P)
- 觀景窗 HUD：點擊畫面中任意點即時對焦（從 3DGS 場景取得深度值，更新 focus depth）、曝光計量條

### 感光元件 × 鏡頭系統

- **感光元件型號選擇**：全幅 35mm / APS-C（1.5x/1.6x）/ M43（2x）/ 1-inch（2.7x）——自動換算等效焦距、等效光圈、景深差異
- **鏡頭角色化**：內建現代無反入門鏡預設（Canon RF 50/1.8、Nikon Z 40/2、Fuji XF 35/2 WR、Sony FE 50/1.8、Sony FE 85/1.8、Sigma 56/1.4 DC DN），各自帶有專屬的光圈葉片數、暗角 profile、色差強度
- 景深 / 散景：從 3DGS 場景幾何取得深度資訊，依感光元件尺寸計算真實 CoC，分層 bokeh kernel 支援多邊形光圈葉片

### 光學效果（WebGPU Post-Processing）

- 曝光三角：EV 計算、過曝/欠曝警告
- ISO 雜訊：基於感光元件物理尺寸的 luminance + chrominance noise 模擬
- 快門模糊：方向性 motion blur kernel
- 鏡頭特性：焦段 FOV 裁切、暗角 (vignette)、色差 (chromatic aberration)

### 其他

- 本地全端部署，影片與場景資料不上傳至外部伺服器
- 重建結果快取於後端，依影片 SHA-256 hash 識別，不重複訓練

---

## 🚀 Getting Started

### Prerequisites

- 套件管理器 [uv](https://docs.astral.sh/uv/getting-started/installation/)，前端工具鏈 [vite-plus](https://viteplus.dev/guide/)

```bash
python --version  # Python 3.12+
node --version    # Node.js 20+
nvidia-smi        # CUDA 12.x
```

### Backend

- 後端伺服器：http://localhost:8000

```bash
cd backend
uv sync

# 首次執行：安裝 COLMAP（需在 PATH 中可存取）
# Windows: https://github.com/colmap/colmap/releases

uv run uvicorn main:app --reload --port 8000
```

> ⚠️ 3DGS 訓練（gsplat）需要 NVIDIA GPU + CUDA 12.x。重建一個中型場景（~300 幀）在 RTX 3060 上約需 5–15 分鐘。

### Frontend

- 開發伺服器：http://localhost:5173

```bash
cd frontend
vp install    # 安裝依賴
vp dev        # 啟動開發伺服器

vp check      # 一次執行 format + lint + type-check
vp test       # 執行單元測試
vp build      # 生產環境打包
```

### Docker（working...）

```bash
docker compose up

# 前端 → http://localhost:5173
# 後端 → http://localhost:8000
# API 文件 → http://localhost:8000/docs
```

---

## 🏗️ Architecture

```
Immersive-Camera-Simulator/
├── frontend/          # Vue 3 + VitePlus + TypeScript
│   ├── src/
│   │   ├── components/
│   │   │   ├── VideoUpload/       # 影片上傳 + 重建進度顯示
│   │   │   ├── SceneViewer/       # 3DGS 場景渲染 + 相機導航（three-gaussian-splats）
│   │   │   ├── Viewfinder/        # 觀景窗 HUD + 控制面板浮層
│   │   │   ├── CompareView/       # 左右分割對比畫面（手機 vs 單眼）
│   │   │   ├── SensorSelector/    # 感光元件型號選擇 + 等效焦距換算顯示
│   │   │   └── LensSelector/      # 鏡頭預設選擇
│   │   ├── composables/
│   │   │   ├── useCamera.ts       # 相機狀態機（模式邏輯、曝光計算）
│   │   │   ├── useSensor.ts       # 感光元件物理參數（CoC、crop factor、noise curve）
│   │   │   ├── useLens.ts         # 鏡頭特性資料（bokeh shape、vignette profile）
│   │   │   ├── useScene.ts        # 3DGS 場景載入 + 相機導航狀態
│   │   │   ├── useImageFX.ts      # WebGPU effect pipeline（post-processing on rendered frame）
│   │   │   └── useCompare.ts      # 雙畫面對比狀態（分割位置、手機基準渲染）
│   │   ├── data/
│   │   │   ├── sensors.ts         # 感光元件資料庫（尺寸、pixel pitch、noise 曲線）
│   │   │   └── lenses.ts          # 鏡頭資料庫（焦距、光圈葉片、bokeh 特性參數）
│   │   ├── gpu/
│   │   │   ├── pipeline.ts        # WebGPU device + pipeline 初始化（post-processing）
│   │   │   └── shaders/
│   │   │       ├── exposure.wgsl      # 曝光、白平衡、色調
│   │   │       ├── noise.wgsl         # ISO 雜訊（sensor-aware luminance + chrominance）
│   │   │       ├── bokeh.wgsl         # 分層散景卷積（多邊形 kernel + depthWeightedBlend）
│   │   │       ├── motionBlur.wgsl    # 快門動態模糊
│   │   │       ├── vignette.wgsl      # 暗角
│   │   │       └── chromAberr.wgsl    # 色差
│   │   └── stores/
│   │       └── cameraStore.ts     # Pinia 全域狀態（相機、感光元件、鏡頭、場景、對比模式）
│   └── public/
│
├── backend/           # Python FastAPI
│   ├── routers/
│   │   ├── reconstruct.py     # 3DGS 重建 endpoint（非同步 job）
│   │   └── health.py
│   ├── services/
│   │   ├── colmap_service.py      # 影片抽幀 + COLMAP SfM 相機位姿估算
│   │   └── gaussian_service.py    # gsplat 3DGS 訓練 + .splat 輸出
│   ├── scenes/            # 重建結果快取目錄（依 video hash 分資料夾）
│   └── main.py
│
├── docker-compose.yml
└── README.md
```

### 資料流

```
使用者上傳影片
    │
    ├─→ SHA-256 hash → 後端查詢既有重建結果
    │       命中 → 直接串流 .splat 檔案至前端，跳過重建
    │       未命中 ↓
    │
    ├─→ [Backend] POST /api/reconstruct
    │       1. 抽幀（ffmpeg）
    │       2. COLMAP SfM → 相機位姿 + 稀疏點雲
    │       3. gsplat 3DGS 訓練（~5–15 分鐘）→ .splat 輸出
    │       前端輪詢 GET /api/reconstruct/{job_id} 取得進度
    │
    └─→ [Frontend] .splat → three-gaussian-splats 載入渲染
            │
            ┌──────────────────────────────────────┐
            │  使用者移動虛擬相機 + 調整參數           │
            └──────────────────────────────────────┘
            │
            3DGS 即時渲染當前視角 → GPU texture (RGBA)
            │
            並行 WebGPU post-processing 兩條 pipeline：
            │
            ├─→ [左側] 手機基準 pipeline（固定小感光元件參數）
            │       exposure → noise(phone) → bokeh(shallow CoC) → vignette
            │
            ├─→ [右側] 單眼模擬 pipeline（使用者設定）
            │       exposure → noise(sensor-aware) → bokeh(depth-aware, lens profile)
            │       → motionBlur → vignette → chromAberr
            │
            CompareView 合成左右畫面，依分割線位置顯示
            │
            教學 HUD 疊加：即時顯示當前參數的物理意義說明
```

**關鍵設計**：3DGS 訓練僅在首次上傳時執行一次（快取於後端）；渲染幀作為 texture 傳入 WebGPU post-processing pipeline，相機效果全部在 GPU 即時計算；深度資訊直接從 3DGS 場景幾何取得，無需額外深度估計模型。

---

## 🛠️ Tech Stack

### Frontend

| 套件 | 版本 | 用途 | 選擇理由 |
|---|---|---|---|
| Vue 3 + Composition API | ^3.5 | UI 框架 | 需求指定 |
| VitePlus | latest | 統一工具鏈入口 | 整合 Vite 6、Vitest、Oxlint、Oxfmt、Rolldown |
| TypeScript | ^5.6 | 型別安全 | 需求指定 |
| Pinia | ^2.x | 狀態管理 | Vue 官方維護與推薦 |
| WebGPU API | native | GPU 影像後處理 | Compute shader 支援，比 WebGL2 快 10x+ |
| GaussianSplats3D (three-gaussian-splats) | latest | 3DGS 場景渲染 + 相機導航 | Three.js 生態，支援 WebGL/WebGPU，有 orbit/FPS 控制 |
| Three.js r168+ | ^0.168 | 3DGS 渲染底層 + bokeh kernel 原型 | GaussianSplats3D 依賴；TSL 用於 bokeh polygon kernel 幾何計算 |
| VueUse | ^11.x | Composable 工具集 | usePointer、useResizeObserver 等 |
| Vitest | ^2.x | 單元測試（由 VitePlus 驅動） | Vite 原生整合 |
| Oxlint + Oxfmt | via VitePlus | Linting + Formatting | Rust 實作，比 ESLint + Prettier 快 50-100x |

### Backend

| 套件 | 版本 | 用途 | 選擇理由 |
|---|---|---|---|
| Python | ^3.12 | 後端語言 | — |
| uv | latest | 套件管理 + 虛擬環境 | 比 pip 快 10-100x |
| FastAPI | ^0.115 | API 框架 | async 支援好，SSE 方便做進度推送 |
| Uvicorn | ^0.32 | ASGI server | — |
| **COLMAP** | latest | SfM 相機位姿估算 + 稀疏點雲 | 業界標準 SfM 工具，支援 CUDA 加速 |
| **gsplat** | latest | 3D Gaussian Splatting 訓練 | nerfstudio 官方快速 3DGS 庫，比原始實作快，Python API |
| ffmpeg-python | ^0.2 | 影片抽幀 | 呼叫系統 ffmpeg，無需自行解碼 |
| PyTorch | ^2.5.1 + CUDA 12.4 | gsplat 訓練後端 | — |
| Pillow | ^11.x | 圖片前處理 | — |
| NumPy | ~2.1 | 點雲 / 場景資料處理 | — |
| python-multipart | ^0.0.12 | 檔案上傳解析 | — |

> **為什麼從 Depth Pro 換成 3DGS？**
> Depth Pro 針對單張照片估算 relative depth，無法支援相機位置移動。3DGS 從多視角影片重建真實 3D 幾何，使用者可自由移動相機、選擇拍攝角度，深度資訊直接從場景幾何取得，物理更正確。

---

## 🖥️ System Requirements

| 項目 | 最低 | 建議 |
|---|---|---|
| GPU | NVIDIA GTX 1650 Ti 4GB | NVIDIA RTX 3060 12GB+ |
| VRAM | 4GB（3DGS 訓練約佔 3–4GB，推論輕量） | 8GB+ |
| RAM | 16GB（COLMAP 大場景需要較多 CPU 記憶體） | 32GB |
| 瀏覽器 | Chrome 113+ | Chrome 最新版 |
| Python | 3.12 | 3.12 |
| CUDA | 12.1 | 12.4 |
| COLMAP | 3.9+ | 最新版 |

> WebGPU 支援請參考[官方文件](https://web.dev/blog/webgpu-supported-major-browsers?hl=zh-tw)，包含 Chrome 113+、Firefox 141+、Edge 113+。本專案以 Chrome 為主要目標瀏覽器。

---

## 🧠 Key Technical Decisions

**為什麼從 Depth Pro → 3DGS？**
Depth Pro 只能針對單張 2D 照片估算深度，無法讓使用者移動相機位置。3DGS 從影片重建真正的 3D 場景，使用者可任意選角，深度資訊從幾何直接取得，不需額外深度估計。這是「沉浸式」體驗的核心差異。

**為什麼 3DGS 而非 NeRF？**
NeRF 渲染速度慢（每幀秒級），無法支援即時相機移動。3DGS 可達 30+ fps 即時渲染，加上 three-gaussian-splats 有完整 Three.js 整合與相機控制，是目前最適合瀏覽器端即時 3D 場景的技術。

**WebGPU post-processing 如何整合 3DGS 渲染？**
three-gaussian-splats 輸出渲染幀（含深度 buffer），我們從 Three.js render target 讀出 RGBA texture 和深度資訊，傳入 WebGPU compute shader pipeline 做曝光 / noise / bokeh 等後處理。左右兩側 pipeline 共用同一渲染幀，只有後處理參數不同。

**重建為什麼在後端而不是前端？**
COLMAP SfM + gsplat 3DGS 訓練需要 CUDA GPU 和大量 CPU 記憶體，單次重建 5–15 分鐘；瀏覽器 WASM 環境無法承載這個量級的計算。後端重建一次後快取結果，之後的即時渲染和效果模擬全在前端 GPU 執行。

**場景快取策略**
影片以 SHA-256 hash 識別，重建結果（.splat 檔案 + COLMAP 位姿）存放於 `backend/scenes/{hash}/`。相同影片重新上傳時直接回傳快取結果，跳過重建流程。

**Bokeh edge bleeding 的處理策略**
分層 bokeh 在前景 / 背景邊界會出現色彩滲透 artifact。採用 **depth-weighted alpha splatting**：每個 depth 層在卷積前先乘上 depth mask（sigmoid 邊緣柔化），卷積後以 depth 距離反比做加權合成。詳見 `gpu/shaders/bokeh.wgsl` 中的 `depthWeightedBlend` 函式。

---

## 📄 License

MIT
