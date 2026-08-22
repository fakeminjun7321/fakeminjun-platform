export function normalizeCropRect(start, end, bounds) {
  const width = Math.max(0, Number(bounds?.width) || 0);
  const height = Math.max(0, Number(bounds?.height) || 0);
  const clamp = (value, maximum) => Math.min(maximum, Math.max(0, Number(value) || 0));
  const startX = clamp(start?.x, width);
  const startY = clamp(start?.y, height);
  const endX = clamp(end?.x, width);
  const endY = clamp(end?.y, height);
  return {
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };
}

export function scaleCropRect(rect, preview, source) {
  const previewWidth = Number(preview?.width) || 0;
  const previewHeight = Number(preview?.height) || 0;
  const sourceWidth = Number(source?.width) || 0;
  const sourceHeight = Number(source?.height) || 0;
  if (previewWidth <= 0 || previewHeight <= 0 || sourceWidth <= 0 || sourceHeight <= 0) {
    throw new RangeError("캡처 영역의 크기를 계산할 수 없습니다.");
  }
  const normalized = normalizeCropRect(
    { x: rect?.x, y: rect?.y },
    { x: (rect?.x || 0) + (rect?.width || 0), y: (rect?.y || 0) + (rect?.height || 0) },
    { width: previewWidth, height: previewHeight },
  );
  const scaleX = sourceWidth / previewWidth;
  const scaleY = sourceHeight / previewHeight;
  return {
    x: Math.round(normalized.x * scaleX),
    y: Math.round(normalized.y * scaleY),
    width: Math.max(1, Math.round(normalized.width * scaleX)),
    height: Math.max(1, Math.round(normalized.height * scaleY)),
  };
}

export function fitWithin(width, height, maximumDimension = 2400, maximumPixels = 4_000_000) {
  const safeWidth = Math.max(1, Math.round(Number(width) || 1));
  const safeHeight = Math.max(1, Math.round(Number(height) || 1));
  const scale = Math.min(
    1,
    maximumDimension / Math.max(safeWidth, safeHeight),
    Math.sqrt(maximumPixels / (safeWidth * safeHeight)),
  );
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}
