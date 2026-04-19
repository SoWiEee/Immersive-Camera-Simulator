/**
 * Video upload and 3DGS reconstruction polling.
 *
 * upload() posts the video to the backend, then polls GET /api/reconstruct/{id}
 * until the job is done or fails.  Each poll invokes onProgress so the UI can
 * show live stage + percentage updates.
 */

const POLL_INTERVAL_MS = 3_000;
const ALLOWED_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo"]);
const MAX_SIZE_MB = 500;

export type ReconstructProgress = {
  stage: string;
  progress: number; // 0 – 1
};

export async function uploadAndReconstruct(
  file: File,
  onProgress: (p: ReconstructProgress) => void,
  signal?: AbortSignal,
): Promise<string> {
  validateFile(file);

  // ── Upload ────────────────────────────────────────────────────────────────
  onProgress({ stage: "影片上傳中…", progress: 0 });

  const form = new FormData();
  form.append("file", file);

  const uploadRes = await fetch("/api/reconstruct", {
    method: "POST",
    body: form,
    signal,
  });

  if (!uploadRes.ok) {
    const body = await uploadRes.json().catch(() => ({}));
    throw new Error(body.detail ?? `上傳失敗 (HTTP ${uploadRes.status})`);
  }

  const { job_id, cached } = (await uploadRes.json()) as {
    job_id: string;
    cached: boolean;
  };

  if (cached) {
    onProgress({ stage: "使用快取場景", progress: 1 });
    return resultUrl(job_id);
  }

  // ── Poll ──────────────────────────────────────────────────────────────────
  while (true) {
    await sleep(POLL_INTERVAL_MS, signal);

    const pollRes = await fetch(`/api/reconstruct/${job_id}`, { signal });
    if (!pollRes.ok) throw new Error(`輪詢失敗 (HTTP ${pollRes.status})`);

    const data = (await pollRes.json()) as {
      status: string;
      stage: string;
      progress: number;
      error: string | null;
    };

    onProgress({ stage: data.stage, progress: data.progress });

    if (data.status === "done") return resultUrl(job_id);
    if (data.status === "error") throw new Error(data.error ?? "重建失敗");
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resultUrl(jobId: string): string {
  return `/api/reconstruct/${jobId}/result`;
}

function validateFile(file: File): void {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error(`不支援的格式「${file.type}」，請上傳 MP4、MOV 或 WebM 影片。`);
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    throw new Error(`影片超過 ${MAX_SIZE_MB} MB 上限。`);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}
