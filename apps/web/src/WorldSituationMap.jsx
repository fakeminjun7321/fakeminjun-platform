import { useEffect, useMemo, useRef, useState } from "react";
import { geoNaturalEarth1, geoPath, geoTransform } from "d3-geo";
import { feature } from "topojson-client";
import atlas from "world-atlas/countries-110m.json";

const COUNTRIES = feature(atlas, atlas.objects.countries).features.filter(
  (country) => String(country.id).padStart(3, "0") !== "010",
);
const MAP_GEOMETRY = { type: "FeatureCollection", features: COUNTRIES };
const MAP_SCALE = { x: 1.13, y: 1.4, offsetX: -0.038, offsetY: 0.029 };

const MAP_LABELS = [
  { label: "CANADA", coordinates: [-108, 58] },
  { label: "UNITED STATES", coordinates: [-104, 39] },
  { label: "MEXICO", coordinates: [-102, 23] },
  { label: "SOUTH AMERICA", coordinates: [-61, -18] },
  { label: "EUROPE", coordinates: [5, 54], offset: [-4, -3] },
  { label: "AFRICA", coordinates: [18, 4], offset: [-16, 0] },
  { label: "RUSSIA", coordinates: [82, 60] },
  { label: "INDIA", coordinates: [79, 21] },
  { label: "CHINA", coordinates: [103, 35] },
  { label: "KOREA", coordinates: [128, 36], offset: [27, -2] },
  { label: "AUSTRALIA", coordinates: [135, -27] },
  { label: "ARCTIC OCEAN", coordinates: [0, 76], kind: "ocean" },
  { label: "PACIFIC OCEAN", coordinates: [-154, 3], kind: "ocean", offset: [48, 0] },
  { label: "ATLANTIC OCEAN", coordinates: [-35, 17], kind: "ocean" },
  { label: "INDIAN OCEAN", coordinates: [73, -17], kind: "ocean" },
  { label: "PACIFIC OCEAN", coordinates: [154, 3], kind: "ocean" },
];

function createDisplayProjection(size) {
  const base = geoNaturalEarth1().fitExtent(
    [
      [16, 16],
      [Math.max(17, size.width - 16), Math.max(17, size.height - 16)],
    ],
    MAP_GEOMETRY,
  );
  const centerX = size.width / 2;
  const centerY = size.height / 2;
  const offsetX = size.width * MAP_SCALE.offsetX;
  const offsetY = size.height * MAP_SCALE.offsetY;

  function stretch([x, y]) {
    return [
      centerX + (x - centerX) * MAP_SCALE.x + offsetX,
      centerY + (y - centerY) * MAP_SCALE.y + offsetY,
    ];
  }

  const affine = geoTransform({
    point(x, y) {
      const [stretchedX, stretchedY] = stretch([x, y]);
      this.stream.point(stretchedX, stretchedY);
    },
  });

  const projection = (coordinates) => stretch(base(coordinates));
  projection.stream = (sink) => base.stream(affine.stream(sink));
  return projection;
}

function drawMap(canvas, size, projection) {
  const density = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(size.width * density));
  canvas.height = Math.max(1, Math.round(size.height * density));
  canvas.style.width = `${size.width}px`;
  canvas.style.height = `${size.height}px`;

  const context = canvas.getContext("2d");
  context.setTransform(density, 0, 0, density, 0, 0);
  context.clearRect(0, 0, size.width, size.height);
  context.fillStyle = "#f7f6f2";
  context.fillRect(0, 0, size.width, size.height);

  const path = geoPath(projection, context);

  COUNTRIES.forEach((country) => {
    context.beginPath();
    path(country);
    const id = String(country.id).padStart(3, "0");
    context.fillStyle = id === "410" ? "#e6ebf1" : id === "840" ? "#efeee9" : "#fbfaf7";
    context.fill();
    context.strokeStyle = id === "410" ? "#526984" : "#98958f";
    context.lineWidth = id === "410" ? 1.1 : 0.85;
    context.stroke();
  });

  context.textAlign = "center";
  context.textBaseline = "middle";
  MAP_LABELS.forEach(({ label, coordinates, kind, offset = [0, 0] }) => {
    const point = projection(coordinates);
    if (!point) return;

    context.font = kind === "ocean"
      ? "italic 10px 'IBM Plex Mono', monospace"
      : "11px 'IBM Plex Mono', monospace";
    context.fillStyle = kind === "ocean" ? "#77746d" : "#595852";
    context.fillText(label, point[0] + offset[0], point[1] + offset[1]);
  });
}

export function WorldSituationMap({ events, selectedId, onSelect }) {
  const frameRef = useRef(null);
  const canvasRef = useRef(null);
  const [size, setSize] = useState({ width: 900, height: 560 });

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;

    const update = () => {
      const bounds = frame.getBoundingClientRect();
      setSize({ width: bounds.width, height: bounds.height });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const projection = useMemo(() => createDisplayProjection(size), [size]);

  useEffect(() => {
    if (canvasRef.current) drawMap(canvasRef.current, size, projection);
  }, [projection, size]);

  return (
    <section className="map-frame" ref={frameRef} aria-label="세계 사건 지도">
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="map-key" aria-hidden="true">
        <span className="north-mark">N</span>
        <span className="north-arrow">↑</span>
      </div>
      <p className="map-caption">GEOGRAPHIC OVERVIEW · DEMO</p>
      {events.map((event) => {
        const point = projection(event.coordinates);
        if (!point) return null;
        return (
          <button
            className={`map-marker${event.id === selectedId ? " is-selected" : ""}`}
            key={event.id}
            style={{ left: `${point[0]}px`, top: `${point[1]}px` }}
            onClick={() => onSelect(event.id)}
            aria-label={`${event.id}. ${event.region}: ${event.title}`}
            aria-pressed={event.id === selectedId}
          >
            {event.id}
          </button>
        );
      })}
    </section>
  );
}
