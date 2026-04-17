# 🔌 API Reference

## `POST /api/depth`

上傳圖片，回傳 depth map 和推算焦距。

**Request**
```
Content-Type: multipart/form-data
file: <image file>  (JPEG / PNG / WebP，最大 20MB)
```

**Response**
```json
{
  "depth_map": "<base64 encoded 16-bit PNG>",
  "focal_length_px": 1234.5,
  "width": 1920,
  "height": 1080,
  "inference_ms": 1842
}
```

## `GET /api/health`

```json
{
  "status": "ok",
  "model_loaded": true,
  "device": "cuda:0",
  "vram_used_mb": 2541
}
```