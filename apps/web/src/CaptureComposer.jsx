import React, { useEffect, useRef, useState } from "react";
import { Check, Crop, Desktop, X } from "@phosphor-icons/react";
import { fitWithin, normalizeCropRect, scaleCropRect } from "./captureGeometry.js";

const MIN_SELECTION_PX = 24;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const FRAME_TIMEOUT_MS = 5_000;

function canvasBlob(canvas, type = "image/png", quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("선택 영역을 이미지로 만들지 못했습니다."));
    }, type, quality);
  });
}

async function boundedCaptureBlob(canvas) {
  const png = await canvasBlob(canvas);
  if (png.size <= MAX_UPLOAD_BYTES) return png;
  for (const quality of [0.86, 0.72, 0.58]) {
    const jpeg = await canvasBlob(canvas, "image/jpeg", quality);
    if (jpeg.size <= MAX_UPLOAD_BYTES) return jpeg;
  }
  throw new Error("선택 영역의 이미지 정보가 너무 많습니다. 영역을 조금 더 작게 선택하세요.");
}

export function waitForVideo(video, { track, timeoutMs = 10_000 } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      track?.removeEventListener?.("ended", onEnded);
      if (video.onloadedmetadata === onLoadedMetadata) video.onloadedmetadata = null;
      if (video.onerror === onError) video.onerror = null;
      if (error) reject(error);
      else resolve();
    };
    const onEnded = () => finish(new Error("공유 화면을 읽기 전에 공유가 종료되었습니다."));
    const onError = () => finish(new Error("공유 화면을 읽지 못했습니다."));
    const onLoadedMetadata = () => {
      Promise.resolve(video.play()).then(() => finish(), (error) => finish(error));
    };
    const timer = window.setTimeout(
      () => finish(new Error("공유 화면을 읽는 시간이 초과되었습니다.")),
      timeoutMs,
    );
    video.onloadedmetadata = onLoadedMetadata;
    video.onerror = onError;
    track?.addEventListener?.("ended", onEnded, { once: true });
    if (track?.readyState === "ended") onEnded();
  });
}

export function stopMediaStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

export function claimCaptureStream(stream, { operationId, operationRef, mountedRef, streamRef }) {
  if (!mountedRef.current || operationRef.current !== operationId) {
    stopMediaStream(stream);
    return false;
  }
  streamRef.current = stream;
  return true;
}

export function createTrackedObjectUrl(blob, {
  isCurrent,
  objectUrls,
  createObjectURL = URL.createObjectURL.bind(URL),
  revokeObjectURL = URL.revokeObjectURL.bind(URL),
}) {
  if (!isCurrent()) return null;
  const url = createObjectURL(blob);
  if (!isCurrent()) {
    revokeObjectURL(url);
    return null;
  }
  objectUrls.add(url);
  return url;
}

export function waitForVideoFrame(video, { track, timeoutMs = FRAME_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let frameCallbackId = null;
    const animationFrameIds = [];
    const finish = (error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      track?.removeEventListener?.("ended", onEnded);
      if (frameCallbackId !== null) video.cancelVideoFrameCallback?.(frameCallbackId);
      animationFrameIds.forEach((id) => window.cancelAnimationFrame?.(id));
      if (error) reject(error);
      else resolve();
    };
    const onEnded = () => finish(new Error("공유 화면이 프레임을 읽기 전에 종료되었습니다."));
    const timer = window.setTimeout(
      () => finish(new Error("공유 화면의 프레임을 기다리는 시간이 초과되었습니다.")),
      timeoutMs,
    );
    track?.addEventListener?.("ended", onEnded, { once: true });
    if (track?.readyState === "ended") {
      onEnded();
      return;
    }
    if (typeof video.requestVideoFrameCallback === "function") {
      frameCallbackId = video.requestVideoFrameCallback(() => finish());
      return;
    }
    const first = window.requestAnimationFrame(() => {
      const second = window.requestAnimationFrame(() => finish());
      animationFrameIds.push(second);
    });
    animationFrameIds.push(first);
  });
}

export function CaptureComposer({ onConfirm, onCancel }) {
  const sourceCanvasRef = useRef(null);
  const selectionSurfaceRef = useRef(null);
  const dragStartRef = useRef(null);
  const streamRef = useRef(null);
  const objectUrlsRef = useRef(new Set());
  const mountedRef = useRef(true);
  const operationRef = useRef(0);
  const [state, setState] = useState("idle");
  const [sourceUrl, setSourceUrl] = useState("");
  const [selection, setSelection] = useState(null);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");

  function isCurrentOperation(operationId) {
    return mountedRef.current && operationRef.current === operationId;
  }

  function stopStream() {
    stopMediaStream(streamRef.current);
    streamRef.current = null;
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationRef.current += 1;
      stopStream();
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
    };
  }, []);

  async function requestCapture() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setState("error");
      setMessage("이 브라우저는 화면 캡처 권한 요청을 지원하지 않습니다.");
      return;
    }
    setState("requesting");
    setMessage("브라우저 선택 창에서 캡처할 탭·창·화면을 고르세요.");
    const operationId = operationRef.current + 1;
    operationRef.current = operationId;
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 1, max: 5 } },
        audio: false,
      });
      if (!claimCaptureStream(stream, { operationId, operationRef, mountedRef, streamRef })) {
        stream = null;
        return;
      }
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      const track = stream.getVideoTracks?.()[0] ?? stream.getTracks?.()[0];
      await waitForVideo(video, { track });
      if (!isCurrentOperation(operationId)) return;
      await waitForVideoFrame(video, { track });
      if (!isCurrentOperation(operationId)) return;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context || !canvas.width || !canvas.height) throw new Error("공유 화면의 크기를 확인하지 못했습니다.");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      sourceCanvasRef.current = canvas;
      const blob = await canvasBlob(canvas);
      const url = createTrackedObjectUrl(blob, {
        isCurrent: () => isCurrentOperation(operationId),
        objectUrls: objectUrlsRef.current,
      });
      if (!url) return;
      setSourceUrl(url);
      setSelection(null);
      setResult(null);
      setMessage("드래그해서 Mandos가 볼 영역만 선택하세요.");
      setState("selecting");
    } catch (error) {
      if (!isCurrentOperation(operationId)) return;
      setState("error");
      setMessage(error?.name === "NotAllowedError"
        ? "캡처가 취소되었거나 권한이 허용되지 않았습니다. 이미지가 전송되지는 않았습니다."
        : "화면 캡처를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      stopMediaStream(stream);
      if (streamRef.current === stream) streamRef.current = null;
    }
  }

  function pointerPosition(event) {
    const bounds = selectionSurfaceRef.current.getBoundingClientRect();
    return {
      point: { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      bounds: { width: bounds.width, height: bounds.height },
    };
  }

  function startSelection(event) {
    if (state !== "selecting") return;
    const { point, bounds } = pointerPosition(event);
    dragStartRef.current = { point, bounds };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setSelection({ x: point.x, y: point.y, width: 0, height: 0 });
  }

  function moveSelection(event) {
    if (!dragStartRef.current || state !== "selecting") return;
    const { point } = pointerPosition(event);
    setSelection(normalizeCropRect(dragStartRef.current.point, point, dragStartRef.current.bounds));
  }

  async function finishSelection(event) {
    if (!dragStartRef.current || state !== "selecting") return;
    const drag = dragStartRef.current;
    const { point } = pointerPosition(event);
    const previewRect = normalizeCropRect(drag.point, point, drag.bounds);
    dragStartRef.current = null;
    if (previewRect.width < MIN_SELECTION_PX || previewRect.height < MIN_SELECTION_PX) {
      setSelection(null);
      setMessage("영역이 너무 작습니다. 조금 더 넓게 드래그하세요.");
      return;
    }
    const operationId = operationRef.current + 1;
    operationRef.current = operationId;
    try {
      const sourceCanvas = sourceCanvasRef.current;
      const crop = scaleCropRect(previewRect, drag.bounds, { width: sourceCanvas.width, height: sourceCanvas.height });
      const outputSize = fitWithin(crop.width, crop.height);
      const output = document.createElement("canvas");
      output.width = outputSize.width;
      output.height = outputSize.height;
      const context = output.getContext("2d", { alpha: false });
      if (!context) throw new Error("선택 영역을 처리하지 못했습니다.");
      context.drawImage(sourceCanvas, crop.x, crop.y, crop.width, crop.height, 0, 0, output.width, output.height);
      const blob = await boundedCaptureBlob(output);
      const url = createTrackedObjectUrl(blob, {
        isCurrent: () => isCurrentOperation(operationId),
        objectUrls: objectUrlsRef.current,
      });
      if (!url) return;
      const extension = blob.type === "image/jpeg" ? "jpg" : "png";
      const file = new File([blob], `workspace-capture-${Date.now()}.${extension}`, { type: blob.type });
      setSelection(previewRect);
      setResult({ file, url, width: output.width, height: output.height });
      setState("ready");
      setMessage("선택한 이미지와 크기를 확인한 뒤 분석에 첨부하세요.");
    } catch (error) {
      if (!isCurrentOperation(operationId)) return;
      setState("error");
      setMessage("선택 영역을 만들지 못했습니다. 다시 영역을 선택해 주세요.");
    }
  }

  function retrySelection() {
    operationRef.current += 1;
    setResult(null);
    setSelection(null);
    setState(sourceUrl ? "selecting" : "idle");
    setMessage(sourceUrl ? "드래그해서 새 영역을 선택하세요." : "");
  }

  return (
    <section className={`capture-composer is-${state}`} aria-labelledby="capture-composer-title">
      <header>
        <div><p className="system-kicker">화면에서 가져오기</p><h3 id="capture-composer-title">화면 영역 캡처</h3></div>
        <button className="icon-button" type="button" onClick={onCancel} aria-label="캡처 취소"><X size={18} /></button>
      </header>
      <p className="capture-privacy-note">브라우저가 선택한 대상의 한 프레임만 가져옵니다. 공유는 즉시 종료되며, 확정하기 전에는 분석 요청으로 보내지 않습니다.</p>
      {state === "idle" || state === "error" ? (
        <button className="capture-start" type="button" onClick={requestCapture}><Desktop size={18} /> 캡처 대상 선택</button>
      ) : null}
      {state === "requesting" ? <div className="capture-stage" aria-busy="true"><Desktop size={20} /><span>브라우저 권한 선택을 기다리는 중</span></div> : null}
      {state === "selecting" ? (
        <div
          className="capture-selection"
          ref={selectionSurfaceRef}
          onPointerDown={startSelection}
          onPointerMove={moveSelection}
          onPointerUp={finishSelection}
          role="application"
          aria-label="드래그하여 분석할 화면 영역 선택"
        >
          <img src={sourceUrl} alt="공유 화면 캡처 미리보기" draggable="false" />
          {selection ? <span className="capture-selection-box" style={{ left: selection.x, top: selection.y, width: selection.width, height: selection.height }} /> : null}
        </div>
      ) : null}
      {state === "ready" && result ? (
        <div className="capture-preview">
          <img src={result.url} alt="Mandos 분석에 첨부할 선택 영역" />
          <div><span>{result.width} × {result.height}px</span><strong>아직 업로드되지 않음</strong></div>
        </div>
      ) : null}
      {message ? <p className={`capture-message${state === "error" ? " is-error" : ""}`} role="status">{message}</p> : null}
      {sourceUrl ? (
        <footer>
          <button type="button" onClick={retrySelection}><Crop size={17} /> 영역 다시 선택</button>
          {state === "ready" && result ? <button type="button" onClick={() => onConfirm(result)}><Check size={17} /> 이 캡처 사용</button> : null}
        </footer>
      ) : null}
    </section>
  );
}

export default CaptureComposer;
