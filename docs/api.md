# 🔌 API Reference

## `POST /api/reconstruct`

上傳影片，啟動 3D Gaussian Splatting 重建 job。

**Request**
```
Content-Type: multipart/form-data
file: <video file>  (MP4 / MOV / WebM，最大 500MB)
```

**Response**
```json
{
  "job_id": "3f8a1c2d-...",
  "cached": false,
  "message": "Reconstruction started"
}
```

若影片 SHA-256 hash 命中快取，`cached: true` 且 `job_id` 指向已完成的 job，可直接呼叫 result endpoint。

---

## `GET /api/reconstruct/{job_id}`

輪詢重建 job 進度。

**Response**
```json
{
  "job_id": "3f8a1c2d-...",
  "status": "training",
  "stage": "gsplat 3DGS training",
  "progress": 0.42,
  "elapsed_s": 312,
  "error": null
}
```

**status 值**

| 值 | 說明 |
|---|---|
| `queued` | 排隊等待 GPU |
| `extracting` | ffmpeg 抽幀中 |
| `sfm` | COLMAP SfM 相機位姿估算中 |
| `training` | gsplat 3DGS 訓練中（progress 0.0–1.0 為訓練 iteration 進度） |
| `done` | 重建完成，可下載結果 |
| `error` | 重建失敗，`error` 欄位說明原因 |

---

## `GET /api/reconstruct/{job_id}/result`

下載重建完成的 .splat 場景檔案。

**Response**
```
Content-Type: application/octet-stream
Content-Disposition: attachment; filename="scene.splat"
```

僅在 `status == "done"` 時可呼叫，否則回傳 `409 Conflict`。

---

## `GET /api/health`

```json
{
  "status": "ok",
  "cuda_available": true,
  "device": "NVIDIA GeForce GTX 1650 Ti",
  "vram_total_mb": 4096,
  "vram_used_mb": 1240,
  "active_jobs": 1,
  "colmap_available": true
}
```

---

## Deprecated（main 分支）

以下 endpoint 僅存在於 `main` 分支（單張照片 Depth Pro 模式），`3d-interactive` 分支已移除：

### ~~`POST /api/depth`~~

~~上傳圖片，回傳 Depth Pro 推算的 depth map。~~
