import assert from "node:assert/strict";
import test from "node:test";
import {
  GOOGLE_DRIVE_UPLOAD_CHUNK_BYTES,
  isGoogleDrivePdfFile,
  nextGoogleDriveUploadOffset,
  safeGoogleDriveUploadUrl,
  uploadFileToGoogleDriveSession,
} from "../src/googleDriveUpload.js";

const SESSION_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=upload-session-123456";

test("browser Drive uploader accepts only Google's exact resumable endpoint", () => {
  assert.equal(safeGoogleDriveUploadUrl(SESSION_URL), SESSION_URL);
  assert.equal(safeGoogleDriveUploadUrl("https://attacker.example/upload?uploadType=resumable&upload_id=upload-session-123456"), null);
  assert.equal(safeGoogleDriveUploadUrl(`${SESSION_URL}&token=secret`), null);
});

test("browser Drive uploader parses only a contiguous server-confirmed byte range", () => {
  assert.equal(nextGoogleDriveUploadOffset(null, 100), 0);
  assert.equal(nextGoogleDriveUploadOffset("bytes=0-63", 100), 64);
  assert.throws(() => nextGoogleDriveUploadOffset("bytes=8-63", 100));
  assert.throws(() => nextGoogleDriveUploadOffset("bytes=0-100", 100));
});

test("browser Drive uploader accepts a signed PDF even when the browser omits its MIME type", async () => {
  const pdf = new Blob(["%PDF-1.7\nfixture"], { type: "" });
  const disguised = new Blob(["not a pdf"], { type: "application/pdf" });
  assert.equal(await isGoogleDrivePdfFile(pdf), true);
  assert.equal(await isGoogleDrivePdfFile(disguised), false);
});

test("browser Drive uploader sends bounded chunks and returns the real Drive file ID", async () => {
  const requests = [];
  const responses = [
    { status: 308, range: `bytes=0-${GOOGLE_DRIVE_UPLOAD_CHUNK_BYTES - 1}`, responseText: "" },
    { status: 200, range: null, responseText: JSON.stringify({ id: "drive-file-123456" }) },
  ];
  const xhrFactory = () => {
    const response = responses.shift();
    return {
      upload: {},
      headers: {},
      open(method, url) { this.method = method; this.url = url; },
      setRequestHeader(name, value) { this.headers[name] = value; },
      getResponseHeader(name) { return name === "Range" ? response.range : null; },
      send(body) {
        requests.push({ method: this.method, url: this.url, headers: this.headers, size: body.size });
        this.upload.onprogress?.({ lengthComputable: true, loaded: body.size, total: body.size });
        this.status = response.status;
        this.responseText = response.responseText;
        queueMicrotask(() => this.onload());
      },
      abort() { this.onabort?.(); },
    };
  };
  const file = new Blob([
    "%PDF-1.7\n",
    new Uint8Array(GOOGLE_DRIVE_UPLOAD_CHUNK_BYTES + 17 - 9),
  ], { type: "application/pdf" });
  const progress = [];
  const result = await uploadFileToGoogleDriveSession({
    file,
    uploadUrl: SESSION_URL,
    xhrFactory,
    onProgress: (value) => progress.push(value),
  });
  assert.equal(result.driveFileId, "drive-file-123456");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].size, GOOGLE_DRIVE_UPLOAD_CHUNK_BYTES);
  assert.equal(requests[0].headers["Content-Range"], `bytes 0-${GOOGLE_DRIVE_UPLOAD_CHUNK_BYTES - 1}/${file.size}`);
  assert.equal(requests[1].size, 17);
  assert.equal(progress.at(-1), 100);
});

test("browser Drive uploader queries the accepted range after a retriable failure", async () => {
  const requests = [];
  const responses = [
    { status: 503, range: null, responseText: "" },
    { status: 308, range: null, responseText: "" },
    { status: 200, range: null, responseText: JSON.stringify({ id: "drive-file-654321" }) },
  ];
  const xhrFactory = () => {
    const response = responses.shift();
    return {
      upload: {},
      headers: {},
      open(method, url) { this.method = method; this.url = url; },
      setRequestHeader(name, value) { this.headers[name] = value; },
      getResponseHeader(name) { return name === "Range" ? response.range : null; },
      send(body) {
        requests.push({ headers: this.headers, size: body.size });
        this.status = response.status;
        this.responseText = response.responseText;
        queueMicrotask(() => this.onload());
      },
      abort() { this.onabort?.(); },
    };
  };
  const file = new Blob(["%PDF-1.7\n", new Uint8Array(119)], { type: "application/pdf" });
  const result = await uploadFileToGoogleDriveSession({
    file,
    uploadUrl: SESSION_URL,
    xhrFactory,
    waitFn: async () => {},
  });
  assert.equal(result.driveFileId, "drive-file-654321");
  assert.equal(requests[1].size, 0);
  assert.equal(requests[1].headers["Content-Range"], `bytes */${file.size}`);
  assert.equal(requests[2].headers["Content-Range"], `bytes 0-${file.size - 1}/${file.size}`);
});

test("browser Drive uploader marks an expired session as a terminal restart", async () => {
  const file = new Blob(["%PDF-1.7\nexpired"], { type: "" });
  await assert.rejects(
    () => uploadFileToGoogleDriveSession({
      file,
      uploadUrl: SESSION_URL,
      xhrFactory: () => ({
        upload: {},
        open() {},
        setRequestHeader() {},
        getResponseHeader() { return null; },
        send() {
          this.status = 404;
          this.responseText = "";
          queueMicrotask(() => this.onload());
        },
        abort() { this.onabort?.(); },
      }),
    }),
    (error) => error.code === "google_drive_upload_expired" && error.status === 404,
  );
});

test("browser Drive uploader aborts the active XHR when the user leaves or cancels", async () => {
  const controller = new AbortController();
  let aborted = false;
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const pending = uploadFileToGoogleDriveSession({
    file: new Blob(["%PDF-1.7\npending"], { type: "application/pdf" }),
    uploadUrl: SESSION_URL,
    signal: controller.signal,
    xhrFactory: () => ({
      upload: {},
      open() {},
      setRequestHeader() {},
      send() { markStarted(); },
      abort() {
        aborted = true;
        this.onabort?.();
      },
    }),
  });
  await started;
  controller.abort();
  await assert.rejects(pending, (error) => error.name === "AbortError");
  assert.equal(aborted, true);
});

test("browser Drive uploader retries a Google rate-limit response only after a status query", async () => {
  const requests = [];
  const responses = [
    {
      status: 403,
      range: null,
      responseText: JSON.stringify({ error: { errors: [{ reason: "userRateLimitExceeded" }] } }),
    },
    { status: 308, range: null, responseText: "" },
    { status: 200, range: null, responseText: JSON.stringify({ id: "drive-file-rate-ok" }) },
  ];
  const xhrFactory = () => {
    const response = responses.shift();
    return {
      upload: {},
      headers: {},
      open() {},
      setRequestHeader(name, value) { this.headers[name] = value; },
      getResponseHeader(name) { return name === "Range" ? response.range : null; },
      send(body) {
        requests.push({ size: body.size, headers: this.headers });
        this.status = response.status;
        this.responseText = response.responseText;
        queueMicrotask(() => this.onload());
      },
      abort() { this.onabort?.(); },
    };
  };
  const result = await uploadFileToGoogleDriveSession({
    file: new Blob(["%PDF-1.7\nrate"], { type: "application/pdf" }),
    uploadUrl: SESSION_URL,
    xhrFactory,
    waitFn: async () => {},
  });
  assert.equal(result.driveFileId, "drive-file-rate-ok");
  assert.match(requests[1].headers["Content-Range"], /^bytes \*\//u);
});
