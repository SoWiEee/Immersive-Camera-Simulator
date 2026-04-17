# 📷 CamSim — Immersive Camera Simulator

> **給想買單眼的人：用自己的照片，親眼感受全幅鏡頭景深和手機鏡頭的差距。**

上傳一張照片，選擇感光元件尺寸與鏡頭，即時看到「手機拍出來的樣子」vs「用全幅單眼拍出來的樣子」——景深、散景、雜訊、色差，全部由物理模型驅動，不是套濾鏡。

**目標**：攝影教學工具 × Portfolio 技術展示。操作體驗接近真實相機，影像效果由 Apple Depth Pro 深度估計 + WebGPU compute shader 驅動。

> 開發路線圖：docs/roadmap.md

> API 文件：docs/api.md

> 相機模擬設計：docs/camera.md

---

## ✨ Features

### 殺手鐧：雙畫面對比 + 參數教學模式

- **左右分割對比**：左側顯示「手機等效效果（小感光元件、大景深、低雜訊曲線）」，右側顯示「你設定的單眼參數效果」，拖動分割線即時對比
- **參數教學 HUD**：每個參數旁顯示即時文字解說——調整光圈時說明景深變化原理，調整 ISO 時顯示當前感光元件在此 ISO 的訊雜比估算

### 相機操作

- 上傳任意照片，立即進入相機操作介面
- 擬真相機 UI：可旋轉的光圈環、快門轉盤、ISO 轉盤 + 數值 HUD
- 拍攝模式：Manual (M) / Aperture Priority (A) / Shutter Priority (S) / Program (P)
- 觀景窗 HUD：可點擊的對焦點選擇（即時更新銳利深度層）、曝光計量條

### 感光元件 × 鏡頭系統

- **感光元件型號選擇**：全幅 35mm / APS-C（1.5x/1.6x）/ M43（2x）/ 1-inch（2.7x）——自動換算等效焦距、等效光圈、景深差異
- **鏡頭角色化**：內建名鏡預設（Zeiss Otus 55mm f/1.4、Canon 85mm f/1.2L、Helios 44-2 58mm f/2 等），各自帶有專屬的光圈葉片形狀、焦外旋轉感、二線性特性
- 景深 / 散景：Depth Pro 推算 metric depth map，依感光元件尺寸計算真實 CoC，分層 bokeh kernel 支援多邊形光圈葉片

### 光學效果

- 曝光三角：EV 計算、過曝/欠曝警告、即時直方圖
- ISO 雜訊：基於感光元件物理尺寸的 luminance + chrominance noise 模擬
- 快門模糊：方向性 motion blur kernel
- 鏡頭特性：焦段 FOV 裁切、暗角 (vignette)、色差 (chromatic aberration)

### 其他

- 本地全端部署，圖片不上傳至外部伺服器
- Depth map 以 SHA-256 hash 快取於 IndexedDB，重整後不需重算

---

## ⚙️ Local Setup

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

# 下載 Depth Pro 模型權重（約 2.5GB）
uv run python scripts/download_model.py

uv run uvicorn main:app --reload --port 8000
```

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

### Docker（推薦本地部署方式）

```bash
docker compose up

# 前端 → http://localhost:5173
# 後端 → http://localhost:8000
# API 文件 → http://localhost:8000/docs
```

---

## 🏗️ Architecture

```
camsim/
├── frontend/          # Vue 3 + VitePlus + TypeScript
│   ├── src/
│   │   ├── components/
│   │   │   ├── CameraBody/        # 擬真相機外觀元件（SVG 轉盤、光圈環）
│   │   │   ├── Viewfinder/        # 觀景窗 + 對焦點選擇 + HUD overlay
│   │   │   ├── CompareView/       # 左右分割對比畫面（手機 vs 單眼）
│   │   │   ├── ControlPanel/      # 數值輸入面板 + 教學 HUD
│   │   │   ├── SensorSelector/    # 感光元件型號選擇 + 等效焦距換算顯示
│   │   │   ├── LensSelector/      # 鏡頭預設選擇（名鏡資料庫）
│   │   │   └── Histogram/         # 即時直方圖
│   │   ├── composables/
│   │   │   ├── useCamera.ts       # 相機狀態機（模式邏輯、曝光計算）
│   │   │   ├── useSensor.ts       # 感光元件物理參數（CoC、crop factor、noise curve）
│   │   │   ├── useLens.ts         # 鏡頭特性資料（bokeh shape、vignette profile）
│   │   │   ├── useDepthMap.ts     # depth map 請求 + IndexedDB 快取
│   │   │   ├── useImageFX.ts      # WebGPU effect pipeline 控制
│   │   │   └── useCompare.ts      # 雙畫面對比狀態（分割位置、手機基準渲染）
│   │   ├── data/
│   │   │   ├── sensors.ts         # 感光元件資料庫（尺寸、pixel pitch、noise 曲線）
│   │   │   └── lenses.ts          # 鏡頭資料庫（焦距、光圈葉片、bokeh 特性參數）
│   │   ├── gpu/
│   │   │   ├── pipeline.ts        # WebGPU device + pipeline 初始化
│   │   │   ├── shaders/
│   │   │   │   ├── exposure.wgsl      # 曝光、白平衡、色調
│   │   │   │   ├── noise.wgsl         # ISO 雜訊（sensor-aware luminance + chrominance）
│   │   │   │   ├── bokeh.wgsl         # 分層散景卷積（多邊形 kernel + depthWeightedBlend）
│   │   │   │   ├── motionBlur.wgsl    # 快門動態模糊
│   │   │   │   ├── vignette.wgsl      # 暗角
│   │   │   │   └── chromAberr.wgsl    # 色差
│   │   │   └── textureUtils.ts    # 圖片 / depth map → GPU texture
│   │   └── stores/
│   │       └── cameraStore.ts     # Pinia 全域狀態（相機、感光元件、鏡頭、對比模式）
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
    ├─→ SHA-256 hash → IndexedDB 查詢
    │       命中 → 直接還原 depth map，跳過後端
    │       未命中 ↓
    │
    ├─→ [Backend] POST /api/depth
    │       Depth Pro 推論 → 輸出 16-bit PNG depth map + 推算焦距(f_px)
    │       結果存入 IndexedDB
    │
    └─→ [Frontend] 圖片 + depth map → WebGPU textures
            │
            ┌──────────────────────────────────────┐
            │  使用者選擇感光元件 + 鏡頭 + 調整參數  │
            └──────────────────────────────────────┘
            │
            並行渲染兩條 pipeline：
            │
            ├─→ [左側] 手機基準 pipeline（固定小感光元件參數）
            │       exposure → noise(phone) → bokeh(shallow CoC) → vignette
            │
            └─→ [右側] 單眼模擬 pipeline（使用者設定）
                    exposure → noise(sensor-aware) → bokeh(depth-aware, lens profile)
                    → motionBlur → vignette → chromAberr
            │
            CompareView 合成左右畫面，依分割線位置顯示
            │
            教學 HUD 疊加：即時顯示當前參數的物理意義說明
```

**關鍵設計**：depth map 只在首次上傳時計算一次（~1-2 秒），快取於 IndexedDB；左右兩側 pipeline 共用同一份 depth texture，無額外後端請求。

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
