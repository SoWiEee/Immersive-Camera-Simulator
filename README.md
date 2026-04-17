# 📷 CamSim — Immersive Camera Simulator

A local-first, physically-grounded camera simulator that lets you upload any photo and experience adjusting real camera parameters — aperture, shutter speed, ISO, focal length, shooting mode — with accurate optical effects rendered in real time.

**目標**：教學工具 × Portfolio 技術展示。操作體驗接近真實相機，影像效果由深度估計模型 + WebGPU shader 驅動。

> 開發路線圖：docs/roadmap.md

> API 文件：docs/api.md

> 相機模擬設計：docs/camera.md

---

## ✨ Features

- 上傳任意照片，立即進入相機操作介面
- 擬真相機 UI：可旋轉的光圈環、快門轉盤、ISO 轉盤 + 數值 HUD
- 拍攝模式：Manual (M) / Aperture Priority (A) / Shutter Priority (S) / Program (P)
- 景深 / 散景：Apple Depth Pro 推算 depth map，分層套用 bokeh kernel（支援多邊形光圈葉片形狀）
- 曝光三角：EV、過曝/欠曝警告、即時直方圖
- ISO 雜訊：基於感光元件尺寸的 luminance noise 模擬
- 快門模糊：方向性 motion blur kernel
- 鏡頭特性：焦段 FOV 裁切、暗角 (vignette)、色差 (chromatic aberration)
- 觀景窗 HUD：對焦確認點、曝光計量條
- 本地全端部署，無資料上傳至外部伺服器

---

## ⚙️ Local Setup

### Prerequisites

```bash
python --version  # Python 3.12+
node --version    # Node.js 20+
nvidia-smi        # CUDA 12.x

# 安裝 uv（Python 套件管理）
pip install uv

# 安裝 VitePlus（前端工具鏈）
npm install -g vite-plus
```

### Backend

- http://localhost:8000

```bash
cd backend

# 安裝依賴（uv 會自動建立 .venv，速度比 pip 快 10-100x）
uv sync

# 下載 Depth Pro 模型權重（約 2.5GB）
uv run python scripts/download_model.py

# 啟動開發伺服器
uv run uvicorn main:app --reload --port 8000
```

### Frontend

- http://localhost:5173

```bash
cd frontend
vp install    # 安裝依賴
vp dev        # 啟動開發伺服器 → http://localhost:5173

vp check      # 一次執行 format + lint + type-check
vp test       # 執行單元測試
vp build      # 生產環境打包
```

### Docker（推薦本地部署方式）

```bash
# 啟動全端（使用 Docker Compose v2 plugin 語法）
docker compose up

# 前端 → http://localhost:5173
# 後端 → http://localhost:8000
# API 文件 → http://localhost:8000/docs
```

---

## 🏗️ Architecture

```
camsim/
├── frontend/          # Vue 3 + Vite + TypeScript
│   ├── src/
│   │   ├── components/
│   │   │   ├── CameraBody/        # 擬真相機外觀元件（SVG 轉盤、光圈環）
│   │   │   ├── Viewfinder/        # 觀景窗 + HUD overlay
│   │   │   ├── ControlPanel/      # 數值輸入面板
│   │   │   └── Histogram/         # 即時直方圖
│   │   ├── composables/
│   │   │   ├── useCamera.ts       # 相機狀態機（模式邏輯、曝光計算）
│   │   │   ├── useDepthMap.ts     # depth map 請求 + 快取
│   │   │   └── useImageFX.ts      # WebGPU effect pipeline 控制
│   │   ├── gpu/
│   │   │   ├── pipeline.ts        # WebGPU device + pipeline 初始化
│   │   │   ├── shaders/
│   │   │   │   ├── exposure.wgsl      # 曝光、白平衡、色調
│   │   │   │   ├── noise.wgsl         # ISO 雜訊（Perlin + Gaussian）
│   │   │   │   ├── bokeh.wgsl         # 分層散景卷積（多邊形 kernel）
│   │   │   │   ├── motionBlur.wgsl    # 快門動態模糊
│   │   │   │   ├── vignette.wgsl      # 暗角
│   │   │   │   └── chromAberr.wgsl    # 色差
│   │   │   └── textureUtils.ts    # 圖片 / depth map → GPU texture
│   │   └── stores/
│   │       └── cameraStore.ts     # Pinia 全域狀態
│   └── public/
│
├── backend/           # Python FastAPI
│   ├── routers/
│   │   ├── depth.py       # Depth Pro 推論 endpoint
│   │   └── health.py
│   ├── services/
│   │   └── depth_service.py   # 模型載入、推論、depth map 後處理
│   ├── models/            # 模型權重
│   └── main.py
│
├── docker-compose.yml
└── README.md
```

### 資料流

```
使用者上傳圖片
    │
    ├─→ [Backend] POST /api/depth
    │       Depth Pro 推論 → 輸出 16-bit PNG depth map
    │       回傳 base64 depth map + 推算焦距(f_px)
    │
    └─→ [Frontend] 圖片 + depth map → WebGPU textures
            │
            使用者調整任意參數（即時）
            │
            WebGPU compute shader pipeline：
            exposure → noise → bokeh(depth-aware) → motionBlur → vignette → chromAberr
            │
            Canvas 顯示結果
```

**關鍵設計**：depth map 只在上傳時計算一次（~1-2 秒），之後所有參數調整都在前端 WebGPU 即時運算，無額外後端請求。

---

## 🛠️ Tech Stack

### Frontend

| 套件 | 版本 | 用途 | 選擇理由 |
|---|---|---|---|
| **Vue 3** + Composition API | ^3.5 | UI 框架 | 需求指定 |
| **VitePlus** (`vp`) | latest | 統一工具鏈入口 | 整合 Vite 6、Vitest、Oxlint、Oxfmt、Rolldown，一個指令取代 npm/eslint/prettier |
| **Vite** | ^6.x | Build tool（由 VitePlus 管理） | 極速 HMR，原生 ESM；VitePlus 底層使用 Rolldown 作為 bundler |
| **TypeScript** | ^5.6 | 型別安全 | 需求指定 |
| **Pinia** | ^2.x | 狀態管理 | Vue 官方推薦，比 Vuex 輕 |
| **WebGPU API** | native | GPU 影像處理 | Compute shader 支援，比 WebGL2 快 10x+，Chrome 113+ 預設啟用 |
| **Three.js r168+** (WebGPU renderer) | ^0.168 | TSL shader 輔助（限 bokeh kernel 原型） | 僅用於以 TypeScript 語法撰寫 bokeh polygon kernel；曝光、noise、vignette 等效能敏感 pass 直接寫原生 WGSL |
| **VueUse** | ^11.x | Composable 工具集 | usePointer、useResizeObserver 等省時 |
| **Vitest** | ^2.x | 單元測試（由 VitePlus `vp test` 驅動） | Vite 原生整合，VitePlus 統一管理 |
| **Oxlint + Oxfmt** | via VitePlus | Linting + Formatting | Rust 實作，比 ESLint + Prettier 快 50-100x，`vp check` 一次執行 |

> **為什麼 WebGPU 而非 WebGL2？**
> WebGL2 沒有 compute pipeline，做卷積模糊只能透過 fragment shader 把矩陣塞進 texture，迂迴且有記憶體限制。WebGPU compute shader 直接操作 buffer，bokeh 卷積核可以做到更大 kernel size 而不掉幀。Chrome 113+ 已預設啟用，覆蓋率足夠本地部署場景使用。

### Backend

| 套件 | 版本 | 用途 | 選擇理由 |
|---|---|---|---|
| **Python** | ^3.12 | 後端語言 | — |
| **uv** | latest | 套件管理 + 虛擬環境 | 比 pip 快 10-100x，`uv sync` 取代 `pip install -r requirements.txt`，使用 `pyproject.toml` + `uv.lock` |
| **FastAPI** | ^0.115 | API 框架 | 你已有經驗，async 支援好 |
| **Uvicorn** | ^0.32 | ASGI server | — |
| **Apple Depth Pro** (`ml-depth-pro`) | latest | 深度估計模型 | 比 Depth Anything V2 在邊緣細節更銳利，輸出 metric depth（真實公尺單位），同時推算焦距，0.3s/張（V100），GTX 1650 Ti 約 1-2s。注意：官方主要測試平台為 Linux + Apple Silicon，Windows + CUDA 環境需參考 [社群安裝指南](#depth-pro-windows) |
| **PyTorch** | ^2.5.1 + CUDA 12.4 | 模型推論 | — |
| **Pillow** | ^11.x | 圖片前處理 | — |
| **NumPy** | ~2.1 | Depth map 後處理 | 固定在 2.1.x：PyTorch 2.5.1 官方支援 NumPy ≥1.26 及 2.x，但 NumPy 2.2+ 尚有 API 異動風險，使用 `~2.1` 確保相容 |
| **python-multipart** | ^0.0.12 | 檔案上傳解析 | — |

> **為什麼 Depth Pro 而非 Depth Anything V2？**
> Depth Anything V2 輸出 relative depth（相對值），需要額外校正才能對應真實物理距離。Apple Depth Pro 直接輸出 metric depth（公尺）且同時估算畫面焦距，對「模擬真實焦段變化影響景深」這個需求更直接有用。GTX 1650 Ti 的 4GB VRAM 可以跑 Depth Pro（模型約 2.5GB）。

---

## 🖥️ System Requirements

| 項目 | 最低 | 建議 |
|---|---|---|
| GPU | NVIDIA GTX 1060 **6GB** 或 GTX 1650 Ti 4GB | NVIDIA RTX 3060 12GB+ |
| VRAM | 4GB（Depth Pro 約佔 2.5GB，需保留 1GB+ 餘裕） | 8GB+ |
| RAM | 8GB | 16GB |
| 瀏覽器 | Chrome 113+ | Chrome 最新版（WebGPU 支援最完整） |
| Python | 3.12 | 3.12 |
| CUDA | 12.1 | 12.4 |

> **WebGPU 支援**：Chrome 113+（2023 年起預設啟用），Firefox 目前需手動開啟 flag。本專案以 Chrome 為主要目標瀏覽器，並在不支援 WebGPU 時顯示明確提示。

---

## 🧠 Key Technical Decisions

**為什麼不用 Three.js 自帶的後處理（EffectComposer）？**
Three.js 的後處理 passes 是為 3D 場景設計，不適合對 2D 照片做 depth-aware 分層處理。主要 effect pass（曝光、noise、vignette、色差、motion blur）直接寫原生 WGSL compute shader，完整控制 bokeh kernel 的物理邏輯。Three.js 僅用於以 TSL（Three.js Shading Language）快速原型化 bokeh polygon kernel 的幾何計算，未來視效能決定是否替換為純 WGSL。

**為什麼 depth map 只算一次？**
Depth Pro 在 GTX 1650 Ti 上約需 1-2 秒，每次調參數都重算會讓 UX 崩潰。Depth map 是場景的靜態屬性（照片不變則深度不變），上傳時算一次存入 GPU texture，之後的所有光學效果變化都在 GPU 即時計算。

**Depth map 的跨 session 快取策略**
GPU texture 僅存活於當前 session，重整後需重算。為避免重複推論，以圖片內容的 SHA-256 hash 作為 key，將 depth map 的 16-bit PNG 序列化後存入 **IndexedDB**（瀏覽器本地，不上傳）。下次上傳相同圖片時直接從 IndexedDB 還原，跳過後端推論。VRAM 管理方面，同時只保留當前圖片的 depth texture，切換圖片時顯式呼叫 `.destroy()` 釋放。

**Bokeh edge bleeding 的處理策略**
分層 bokeh 在前景 / 背景邊界會出現前景色彩滲入背景模糊的 leakage artifact。採用 **depth-weighted alpha splatting**：每個 depth 層在卷積前先乘上 depth mask（sigmoid 邊緣柔化），卷積後以 depth 距離反比做加權合成，抑制跨層色彩滲透。詳見 `gpu/shaders/bokeh.wgsl` 中的 `depthWeightedBlend` 函式。

**為什麼前端不直接跑 Depth Pro？**
WebAssembly + ONNX.js 無法在 4GB VRAM 的 GPU 上高效跑 Depth Pro 這個量級的模型，且 WASM 推論比 CUDA 慢 10-20x。保持前後端分離：後端負責一次性的重模型推論，前端負責高頻的即時渲染。

---

## 📄 License

MIT
