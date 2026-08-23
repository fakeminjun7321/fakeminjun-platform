export const GOOGLE_DRIVE_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
export const GOOGLE_DRIVE_UPLOAD_MAX_BYTES = 512 * 1024 * 1024;
const GOOGLE_DRIVE_UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const GOOGLE_DRIVE_UPLOAD_MAX_RETRIES = 5;

function uploadError(message, code, status = null) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

export function safeGoogleDriveUploadUrl(value) {
  try {
    const url = new URL(value);
    const keys = [...url.searchParams.keys()];
    const uploadId = url.searchParams.get("upload_id");
    if (url.protocol !== "https:" || url.hostname !== "www.googleapis.com"
      || url.pathname !== "/upload/drive/v3/files" || url.username || url.password
      || url.searchParams.get("uploadType") !== "resumable"
      || keys.some((key) => !["uploadType", "upload_id"].includes(key))
      || typeof uploadId !== "string" || uploadId.length < 10 || uploadId.length > 2048
      || /[\u0000-\u0020]/u.test(uploadId) || url.href.length > 4096) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function nextGoogleDriveUploadOffset(rangeHeader, totalBytes) {
  if (rangeHeader === null || rangeHeader === undefined || rangeHeader === "") return 0;
  const match = /^bytes=0-(\d+)$/u.exec(rangeHeader.trim());
  const end = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(totalBytes) || totalBytes < 1 || !Number.isSafeInteger(end) || end < 0 || end >= totalBytes) {
    throw new Error("Google Drive가 올바르지 않은 업로드 범위를 반환했습니다.");
  }
  return end + 1;
}

export async function isGoogleDrivePdfFile(file) {
  if (!file || typeof file.slice !== "function" || !Number.isSafeInteger(file.size)
    || file.size < 1 || file.size > GOOGLE_DRIVE_UPLOAD_MAX_BYTES
    || !["", "application/pdf", "application/x-pdf"].includes(file.type ?? "")) {
    return false;
  }
  const prefix = new Uint8Array(await file.slice(0, Math.min(file.size, 1024)).arrayBuffer());
  return new TextDecoder("latin1").decode(prefix).includes("%PDF-");
}

function parseCompletedFile(responseText) {
  let body;
  try {
    body = JSON.parse(responseText);
  } catch {
    throw new Error("Google Drive의 업로드 완료 응답을 읽지 못했습니다.");
  }
  if (!body || typeof body.id !== "string" || !/^[A-Za-z0-9_-]{10,200}$/u.test(body.id)) {
    throw new Error("Google Drive가 업로드된 파일 식별자를 반환하지 않았습니다.");
  }
  return body.id;
}

function xhrRequest({ uploadUrl, body, contentRange, signal, onProgress, xhrFactory }) {
  return new Promise((resolve, reject) => {
    const xhr = xhrFactory();
    const abort = () => xhr.abort();
    xhr.open("PUT", uploadUrl, true);
    xhr.responseType = "text";
    xhr.timeout = GOOGLE_DRIVE_UPLOAD_TIMEOUT_MS;
    xhr.setRequestHeader("Content-Type", "application/pdf");
    xhr.setRequestHeader("Content-Range", contentRange);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded, event.total);
    };
    xhr.onload = () => {
      signal?.removeEventListener("abort", abort);
      resolve({
        status: xhr.status,
        range: xhr.getResponseHeader("Range"),
        responseText: xhr.responseText,
      });
    };
    xhr.onerror = () => {
      signal?.removeEventListener("abort", abort);
      reject(new Error("Google Drive 업로드 네트워크 연결이 끊겼습니다."));
    };
    xhr.ontimeout = () => {
      signal?.removeEventListener("abort", abort);
      reject(new Error("Google Drive 업로드 응답 시간이 초과됐습니다."));
    };
    xhr.onabort = () => {
      signal?.removeEventListener("abort", abort);
      reject(new DOMException("Upload aborted", "AbortError"));
    };
    if (signal?.aborted) {
      reject(new DOMException("Upload aborted", "AbortError"));
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    xhr.send(body);
  });
}

function retryableStatus(status, responseText = "") {
  if (status === 408 || status === 429 || status >= 500) return true;
  if (status !== 403) return false;
  try {
    const reasons = JSON.parse(responseText)?.error?.errors?.map(({ reason }) => reason) ?? [];
    return reasons.some((reason) => ["rateLimitExceeded", "userRateLimitExceeded", "backendError"].includes(reason));
  } catch {
    return false;
  }
}

async function queryGoogleDriveUploadStatus({ uploadUrl, totalBytes, signal, xhrFactory }) {
  return xhrRequest({
    uploadUrl,
    body: new Blob([], { type: "application/pdf" }),
    contentRange: `bytes */${totalBytes}`,
    signal,
    xhrFactory,
  });
}

function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Upload aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Upload aborted", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function recoverGoogleDriveUpload({
  uploadUrl,
  totalBytes,
  signal,
  xhrFactory,
  startingAttempt,
  waitFn,
  originalError,
}) {
  for (let attempt = startingAttempt; attempt <= GOOGLE_DRIVE_UPLOAD_MAX_RETRIES; attempt += 1) {
    await waitFn(Math.min(8_000, 500 * (2 ** (attempt - 1))), signal);
    let status;
    try {
      status = await queryGoogleDriveUploadStatus({ uploadUrl, totalBytes, signal, xhrFactory });
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      if (attempt === GOOGLE_DRIVE_UPLOAD_MAX_RETRIES) throw originalError ?? error;
      continue;
    }
    if (status.status === 200 || status.status === 201) {
      return { completedFileId: parseCompletedFile(status.responseText), offset: totalBytes, attempt };
    }
    if (status.status === 308) {
      return { completedFileId: null, offset: nextGoogleDriveUploadOffset(status.range, totalBytes), attempt };
    }
    if (status.status === 404) {
      throw uploadError("Google Drive 업로드 시간이 만료됐습니다. 다시 시작해 주세요.", "google_drive_upload_expired", 404);
    }
    if (!retryableStatus(status.status, status.responseText)) {
      throw uploadError(
        `Google Drive 업로드 상태를 확인하지 못했습니다. (HTTP ${status.status})`,
        "google_drive_upload_rejected",
        status.status,
      );
    }
  }
  throw originalError ?? new Error("Google Drive 업로드 상태를 확인하지 못했습니다.");
}

export async function uploadFileToGoogleDriveSession({
  file,
  uploadUrl,
  signal,
  onProgress,
  xhrFactory = () => new XMLHttpRequest(),
  waitFn = abortableDelay,
}) {
  const safeUrl = safeGoogleDriveUploadUrl(uploadUrl);
  if (!safeUrl) throw new Error("허용되지 않은 Google Drive 업로드 주소입니다.");
  if (!(await isGoogleDrivePdfFile(file))) {
    throw new Error("512MiB 이하 PDF 파일만 Google Drive에 추가할 수 있습니다.");
  }

  let offset = 0;
  let retryCount = 0;
  while (offset < file.size) {
    if (signal?.aborted) throw new DOMException("Upload aborted", "AbortError");
    const endExclusive = Math.min(file.size, offset + GOOGLE_DRIVE_UPLOAD_CHUNK_BYTES);
    const chunk = file.slice(offset, endExclusive, "application/pdf");
    let result;
    try {
      result = await xhrRequest({
        uploadUrl: safeUrl,
        body: chunk,
        contentRange: `bytes ${offset}-${endExclusive - 1}/${file.size}`,
        signal,
        xhrFactory,
        onProgress: (loaded) => onProgress?.(Math.min(100, Math.round(((offset + loaded) / file.size) * 100))),
      });
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      const recovered = await recoverGoogleDriveUpload({
        uploadUrl: safeUrl,
        totalBytes: file.size,
        signal,
        xhrFactory,
        startingAttempt: retryCount + 1,
        waitFn,
        originalError: error,
      });
      if (recovered.completedFileId) {
        onProgress?.(100);
        return { driveFileId: recovered.completedFileId };
      }
      retryCount = recovered.offset > offset ? 0 : recovered.attempt;
      offset = recovered.offset;
      continue;
    }

    if (result.status === 200 || result.status === 201) {
      onProgress?.(100);
      return { driveFileId: parseCompletedFile(result.responseText) };
    }
    if (result.status === 308) {
      const reportedOffset = nextGoogleDriveUploadOffset(result.range, file.size);
      retryCount = reportedOffset > offset ? 0 : retryCount + 1;
      if (retryCount > GOOGLE_DRIVE_UPLOAD_MAX_RETRIES) throw new Error("Google Drive가 같은 업로드 구간을 반복해서 받지 못했습니다.");
      offset = reportedOffset;
      continue;
    }
    if (retryableStatus(result.status, result.responseText)) {
      const recovered = await recoverGoogleDriveUpload({
        uploadUrl: safeUrl,
        totalBytes: file.size,
        signal,
        xhrFactory,
        startingAttempt: retryCount + 1,
        waitFn,
        originalError: new Error(`Google Drive 업로드가 잠시 중단됐습니다. (HTTP ${result.status})`),
      });
      if (recovered.completedFileId) {
        onProgress?.(100);
        return { driveFileId: recovered.completedFileId };
      }
      retryCount = recovered.offset > offset ? 0 : recovered.attempt;
      offset = recovered.offset;
      continue;
    }
    if (result.status === 404) {
      throw uploadError("Google Drive 업로드 시간이 만료됐습니다. 다시 시작해 주세요.", "google_drive_upload_expired", 404);
    }
    throw uploadError(
      `Google Drive 업로드가 중단됐습니다. (HTTP ${result.status})`,
      "google_drive_upload_rejected",
      result.status,
    );
  }
  throw new Error("Google Drive 업로드 완료 응답을 받지 못했습니다.");
}
