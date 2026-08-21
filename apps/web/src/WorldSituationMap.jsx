import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowSquareOut,
  Brain,
  ChartLineUp,
  Crosshair,
  GlobeHemisphereWest,
  LinkSimple,
  Minus,
  Plus,
  ShieldCheck,
  Stack,
  X,
} from "@phosphor-icons/react";
import { geoGraticule10, geoNaturalEarth1, geoPath, geoTransform } from "d3-geo";
import { feature } from "topojson-client";
import atlas from "world-atlas/countries-110m.json";
import { CATEGORY_META, STATUS_META, getEventRelations } from "./mapLayers.js";

const COUNTRIES = feature(atlas, atlas.objects.countries).features.filter(
  (country) => String(country.id).padStart(3, "0") !== "010",
);
const MAP_GEOMETRY = { type: "FeatureCollection", features: COUNTRIES };
const GRATICULE = geoGraticule10();
const LONGITUDES = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180];
const LATITUDES = [80, 60, 40, 20, 0, -20, -40, -60, -80];

const MAP_LABELS = [
  { label: "캐나다", coordinates: [-108, 57] },
  { label: "미국", coordinates: [-104, 38] },
  { label: "멕시코", coordinates: [-102, 23] },
  { label: "남아메리카", coordinates: [-61, -20] },
  { label: "유럽", coordinates: [12, 52] },
  { label: "아프리카", coordinates: [18, 4] },
  { label: "러시아", coordinates: [82, 59] },
  { label: "인도", coordinates: [79, 21] },
  { label: "중국", coordinates: [103, 35] },
  { label: "대한민국", coordinates: [127.6, 36.4], offset: [43, -2] },
  { label: "호주", coordinates: [135, -27] },
  { label: "북극해", coordinates: [0, 74], kind: "ocean" },
  { label: "태평양", coordinates: [-148, 3], kind: "ocean", offset: [36, 0] },
  { label: "대서양", coordinates: [-35, 17], kind: "ocean" },
  { label: "인도양", coordinates: [73, -17], kind: "ocean" },
  { label: "태평양", coordinates: [154, 3], kind: "ocean" },
];

const LAYERS = [
  { id: "diplomacy", label: "외교", icon: GlobeHemisphereWest },
  { id: "security", label: "안보", icon: ShieldCheck },
  { id: "economy", label: "경제", icon: ChartLineUp },
  { id: "supply", label: "공급망", icon: LinkSimple },
];

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function createDisplayProjection(size, zoom) {
  const padding = size.width < 620 ? 26 : 52;
  const base = geoNaturalEarth1().fitExtent(
    [[padding, 34], [Math.max(padding + 1, size.width - padding), Math.max(35, size.height - 40)]],
    MAP_GEOMETRY,
  );
  const centerX = size.width / 2;
  const centerY = size.height / 2;
  const baseBounds = geoPath(base).bounds(MAP_GEOMETRY);
  const baseHeight = Math.max(1, baseBounds[1][1] - baseBounds[0][1]);
  const shapeX = size.width < 620 ? 1 : 0.9;
  const shapeY = size.width < 620 ? 1 : Math.min(1.18, Math.max(1, (size.height - 16) / baseHeight));

  function transformPoint([x, y]) {
    return [centerX + (x - centerX) * zoom * shapeX, centerY + (y - centerY) * zoom * shapeY];
  }

  const affine = geoTransform({
    point(x, y) {
      const [nextX, nextY] = transformPoint([x, y]);
      this.stream.point(nextX, nextY);
    },
  });

  const projection = (coordinates) => {
    const point = base(coordinates);
    return point ? transformPoint(point) : null;
  };
  projection.invert = ([x, y]) => base.invert([
    centerX + (x - centerX) / (zoom * shapeX),
    centerY + (y - centerY) / (zoom * shapeY),
  ]);
  projection.stream = (sink) => base.stream(affine.stream(sink));
  return projection;
}

function drawArrow(context, from, to, color) {
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const size = 7;
  context.save();
  context.translate(to[0], to[1]);
  context.rotate(angle);
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(-size, size * 0.55);
  context.lineTo(-size, -size * 0.55);
  context.closePath();
  context.fill();
  context.restore();
}

function drawProjectedRelation(context, projection, relation, color, dashed = false) {
  const from = projection(relation.from.coordinates);
  const to = projection(relation.to.coordinates);
  if (!from || !to) return;

  const control = [
    (from[0] + to[0]) / 2,
    Math.min(from[1], to[1]) - Math.min(90, Math.abs(to[0] - from[0]) * 0.12),
  ];
  context.save();
  context.beginPath();
  context.moveTo(from[0], from[1]);
  context.quadraticCurveTo(control[0], control[1], to[0], to[1]);
  context.strokeStyle = color;
  context.lineWidth = dashed ? 1.1 : 1.55;
  if (dashed) context.setLineDash([5, 5]);
  context.stroke();
  drawArrow(context, control, to, color);
  context.restore();
}

function drawMap(canvas, size, projection, selectedEvent, activeLayers) {
  const density = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(size.width * density));
  canvas.height = Math.max(1, Math.round(size.height * density));
  canvas.style.width = `${size.width}px`;
  canvas.style.height = `${size.height}px`;

  const context = canvas.getContext("2d");
  context.setTransform(density, 0, 0, density, 0, 0);
  context.clearRect(0, 0, size.width, size.height);
  context.fillStyle = "#071923";
  context.fillRect(0, 0, size.width, size.height);
  const path = geoPath(projection, context);

  context.save();
  context.beginPath();
  path(GRATICULE);
  context.setLineDash([2, 4]);
  context.strokeStyle = "rgba(56, 93, 113, 0.48)";
  context.lineWidth = 0.65;
  context.stroke();
  context.restore();

  COUNTRIES.forEach((country) => {
    context.beginPath();
    path(country);
    const id = String(country.id).padStart(3, "0");
    context.fillStyle = id === "410" ? "#28546b" : id === "840" ? "#214657" : "#1b3745";
    context.fill();
    context.strokeStyle = id === "410" ? "#6a9ab2" : "#416372";
    context.lineWidth = id === "410" ? 1.25 : 0.65;
    context.stroke();
  });

  if (activeLayers.has("supply")) {
    const relations = getEventRelations(selectedEvent);
    relations.forEach((relation, index) => {
      const color = index === 0 ? "#4386d1" : "#c58a35";
      drawProjectedRelation(context, projection, relation, color, index > 0);
    });
  }

  context.textAlign = "center";
  context.textBaseline = "middle";
  MAP_LABELS.forEach(({ label, coordinates, kind, offset = [0, 0] }) => {
    const point = projection(coordinates);
    if (!point) return;
    context.font = kind === "ocean"
      ? "12px 'IBM Plex Mono', monospace"
      : "500 13px 'Noto Sans KR Variable', 'Apple SD Gothic Neo', sans-serif";
    context.fillStyle = kind === "ocean" ? "#648899" : "#b3c3ca";
    context.fillText(label, point[0] + offset[0], point[1] + offset[1]);
  });
}

function formatLongitude(value) {
  if (value === 0) return "0°";
  return `${Math.abs(value)}°${value < 0 ? "W" : "E"}`;
}

function formatLatitude(value) {
  if (value === 0) return "0°";
  return `${Math.abs(value)}°${value < 0 ? "S" : "N"}`;
}

function formatCoordinate(value, positive, negative) {
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutesFloat = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = Math.floor((minutesFloat - minutes) * 60);
  return `${degrees}° ${String(minutes).padStart(2, "0")}′ ${String(seconds).padStart(2, "0")}″ ${value >= 0 ? positive : negative}`;
}

function CoordinateAxes() {
  return (
    <div className="coordinate-axes" aria-hidden="true">
      <div className="longitude-axis is-top">{LONGITUDES.map((value) => <span key={value}>{formatLongitude(value)}</span>)}</div>
      <div className="longitude-axis is-bottom">{LONGITUDES.map((value) => <span key={value}>{formatLongitude(value)}</span>)}</div>
      <div className="latitude-axis is-left">{LATITUDES.map((value) => <span key={value}>{formatLatitude(value)}</span>)}</div>
      <div className="latitude-axis is-right">{LATITUDES.map((value) => <span key={value}>{formatLatitude(value)}</span>)}</div>
    </div>
  );
}

export function WorldSituationMap({ events, selectedEvent, onSelect, onOpenIssues, onOpenAi }) {
  const frameRef = useRef(null);
  const canvasRef = useRef(null);
  const resizeFrameRef = useRef(null);
  const previousEventIdRef = useRef(selectedEvent.id);
  const [size, setSize] = useState({ width: 1440, height: 820 });
  const [zoom, setZoom] = useState(1);
  const [activeLayers, setActiveLayers] = useState(() => new Set(LAYERS.map(({ id }) => id)));
  const [cursorCoordinate, setCursorCoordinate] = useState(selectedEvent.coordinates);
  const [popoverOpen, setPopoverOpen] = useState(() => !window.matchMedia("(max-width: 600px)").matches);
  const [fontRevision, setFontRevision] = useState(0);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const update = () => {
      window.cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = window.requestAnimationFrame(() => {
        const bounds = frame.getBoundingClientRect();
        setSize({ width: bounds.width, height: bounds.height });
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(resizeFrameRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    document.fonts?.ready.then(() => { if (!cancelled) setFontRevision((value) => value + 1); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (previousEventIdRef.current !== selectedEvent.id) setPopoverOpen(true);
    previousEventIdRef.current = selectedEvent.id;
    setCursorCoordinate(selectedEvent.coordinates);
  }, [selectedEvent.coordinates, selectedEvent.id]);

  const projection = useMemo(() => createDisplayProjection(size, zoom), [size, zoom]);

  useEffect(() => {
    if (canvasRef.current) drawMap(canvasRef.current, size, projection, selectedEvent, activeLayers);
  }, [activeLayers, fontRevision, projection, selectedEvent, size]);

  const selectedPoint = projection(selectedEvent.coordinates);
  const popoverPosition = selectedPoint ? {
    left: `${clamp(selectedPoint[0] + 34, 22, Math.max(22, size.width - 302))}px`,
    top: `${clamp(selectedPoint[1] - 36, 92, Math.max(92, size.height - 250))}px`,
  } : undefined;
  const relation = getEventRelations(selectedEvent)[0];

  function toggleLayer(id) {
    setActiveLayers((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handlePointerMove(event) {
    const bounds = frameRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const coordinate = projection.invert([event.clientX - bounds.left, event.clientY - bounds.top]);
    if (coordinate && Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1])) setCursorCoordinate(coordinate);
  }

  return (
    <section className="map-frame" ref={frameRef} aria-label="세계 사건 상황지도" onPointerMove={handlePointerMove}>
      <canvas ref={canvasRef} aria-hidden="true" />
      <CoordinateAxes />
      <div className="map-data-cluster" aria-label="지도 데이터 상태">
        DEMO DATASET <span>·</span> 신호 {events.length} <span>·</span> 출처 33 <span>·</span> 마지막 확인 20:04 KST
      </div>
      <div className="layer-controls" aria-label="지도 레이어">
        <div className="layer-heading"><Stack size={14} /> LAYERS</div>
        {LAYERS.map(({ id, label, icon: Icon }) => (
          <button type="button" key={id} className={activeLayers.has(id) ? "is-active" : ""}
            onClick={() => toggleLayer(id)} aria-pressed={activeLayers.has(id)}>
            <Icon size={17} aria-hidden="true" />{label}
          </button>
        ))}
      </div>

      <div className="map-controls" aria-label="지도 배율">
        <button type="button" onClick={() => setZoom((value) => clamp(value + 0.1, 0.9, 1.4))} aria-label="지도 확대"><Plus size={19} /></button>
        <button type="button" onClick={() => setZoom((value) => clamp(value - 0.1, 0.9, 1.4))} aria-label="지도 축소"><Minus size={19} /></button>
        <button type="button" onClick={() => setZoom(1)} aria-label="지도 배율 초기화"><Crosshair size={18} /></button>
      </div>
      <div className="scale-readout" aria-hidden="true"><span>1000 km</span><i /><small>PROJ. NATURAL EARTH</small></div>
      <output className="coordinate-readout" aria-label="지도 커서 좌표">
        {formatCoordinate(cursorCoordinate[1], "N", "S")} &nbsp; {formatCoordinate(cursorCoordinate[0], "E", "W")}
      </output>

      {events.map((event) => {
        const point = projection(event.coordinates);
        if (!point) return null;
        return (
          <button
            className={`map-marker category-${event.category}${event.id === selectedEvent.id ? " is-selected" : ""}`}
            key={event.id}
            style={{ left: `${point[0]}px`, top: `${point[1]}px` }}
            onClick={() => { onSelect(event.id); setPopoverOpen(true); }}
            aria-label={`${CATEGORY_META[event.category].label}, ${event.region}: ${event.title}`}
            aria-pressed={event.id === selectedEvent.id}
          >
            <span>{String(event.id).padStart(2, "0")}</span>
          </button>
        );
      })}

      {popoverOpen && popoverPosition && (
        <section className="event-popover" style={popoverPosition} aria-label={`${selectedEvent.title} 선택 사건`}>
          <button className="popover-close" type="button" onClick={() => setPopoverOpen(false)} aria-label="선택 사건 팝오버 닫기"><X size={18} /></button>
          <div className="popover-meta">
            <strong>{String(selectedEvent.id).padStart(2, "0")}</strong>
            <span>{selectedEvent.region} · {selectedEvent.time} KST</span>
          </div>
          <h2>{selectedEvent.title}</h2>
          <p>{selectedEvent.summary}</p>
          <div className="popover-evidence">
            <span>출처 {selectedEvent.sources}</span><span>합치도 {selectedEvent.agreement}%</span>
            <strong>{STATUS_META[selectedEvent.status].label}</strong>
          </div>
          {relation && <p className="relation-label"><ShieldCheck size={15} /> 검증된 관계&nbsp; {selectedEvent.region} → {relation.to.label} · {selectedEvent.relationLabel}</p>}
          <div className="popover-actions">
            <button type="button" onClick={onOpenIssues}>이슈 분석 보기 <ArrowSquareOut size={16} /></button>
            <button type="button" onClick={onOpenAi}><Brain size={17} /> AI에 묻기</button>
          </div>
        </section>
      )}
    </section>
  );
}
