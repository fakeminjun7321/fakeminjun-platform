import React, { useEffect, useMemo, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
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
import { AttributionControl, Map as MapLibreMap, setWorkerUrl } from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import {
  CATEGORY_META,
  STATUS_META,
  eventsToFeatureCollection,
  getEventRelations,
  relationsToFeatureCollection,
} from "./mapLayers.js";
import { observationsToFeatureCollection } from "./officialObservations.js";

const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
const MAP_FONT_STACK = ["Noto Sans Regular"];
const KOREA_VIEW = Object.freeze({ center: [126.98, 37.56], zoom: 4.8 });
const MAP_VIEW_STORAGE_KEY = "intel-workspace:international-map-view";
const OBSERVATION_TIME_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const KOREAN_LABEL_LAYERS = Object.freeze([
  "water_name",
  "highway_name_other",
  "place_other",
  "place_suburb",
  "place_village",
  "place_town",
  "place_city",
  "place_city_large",
  "place_state",
  "place_country_other",
  "place_country_minor",
  "place_country_major",
]);

const LAYERS = [
  { id: "official-observations", label: "공식 관측", icon: GlobeHemisphereWest },
  { id: "korea-core", label: "한국 핵심", icon: Crosshair },
  { id: "us-impact", label: "미국 영향", icon: GlobeHemisphereWest },
  { id: "rapid-change", label: "기타 급변", icon: ChartLineUp },
  { id: "supply", label: "관계선", icon: LinkSimple },
];

setWorkerUrl(mapWorkerUrl);

function formatCoordinate(value, positive, negative) {
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutesFloat = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = Math.floor((minutesFloat - minutes) * 60);
  return `${degrees}° ${String(minutes).padStart(2, "0")}′ ${String(seconds).padStart(2, "0")}″ ${value >= 0 ? positive : negative}`;
}

function formatObservationTime(value) {
  const date = new Date(value ?? 0);
  return Number.isNaN(date.getTime()) ? "시각 미상" : OBSERVATION_TIME_FORMATTER.format(date);
}

function getVisibleEvents(events, activeLayers) {
  return events.filter((event) => activeLayers.has(event.category));
}

function getStoredMapView() {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(MAP_VIEW_STORAGE_KEY));
    const validCenter = Array.isArray(stored?.center)
      && stored.center.length === 2
      && Number.isFinite(stored.center[0])
      && Number.isFinite(stored.center[1])
      && stored.center[0] >= -180
      && stored.center[0] <= 180
      && stored.center[1] >= -85
      && stored.center[1] <= 85;
    const validZoom = Number.isFinite(stored?.zoom) && stored.zoom >= -1 && stored.zoom <= 13;
    if (!validCenter || !validZoom) return KOREA_VIEW;
    return {
      center: stored.center,
      zoom: stored.zoom,
      bearing: Number.isFinite(stored.bearing) ? stored.bearing : 0,
      pitch: Number.isFinite(stored.pitch) ? stored.pitch : 0,
      overview: stored.overview === true,
    };
  } catch {
    return KOREA_VIEW;
  }
}

function saveMapView(map, overview) {
  const center = map.getCenter();
  try {
    window.sessionStorage.setItem(MAP_VIEW_STORAGE_KEY, JSON.stringify({
      center: [center.lng, center.lat],
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
      overview,
    }));
  } catch {
    // URL hash still preserves the view when session storage is unavailable.
  }
}

function localizeBasemapLabels(map) {
  const textField = [
    "coalesce",
    ["get", "name_ko"],
    ["get", "name:ko"],
    ["get", "name"],
    ["get", "name_en"],
    ["get", "name:latin"],
  ];
  map.getStyle().layers?.forEach((layer) => {
    if (layer.type === "symbol" && layer.layout?.["text-field"]) {
      map.setLayoutProperty(layer.id, "text-font", MAP_FONT_STACK);
    }
  });
  KOREAN_LABEL_LAYERS.forEach((layerId) => {
    if (!map.getLayer(layerId)) return;
    map.setLayoutProperty(layerId, "text-field", textField);
    if (["place_town", "place_city", "place_city_large"].includes(layerId)) {
      map.setLayoutProperty(layerId, "icon-image", "");
    }
  });
}

function addIntelligenceLayers(map, events, observations) {
  map.addSource("official-observations", {
    type: "geojson",
    data: observationsToFeatureCollection(observations),
  });

  map.addLayer({
    id: "official-observation-halos",
    type: "circle",
    source: "official-observations",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["get", "count"], 1, 17, 5, 26, 20, 38],
      "circle-color": "#69c6c2",
      "circle-opacity": 0.09,
      "circle-stroke-color": "#69c6c2",
      "circle-stroke-width": 1,
      "circle-stroke-opacity": 0.28,
    },
  });

  map.addLayer({
    id: "official-observation-points",
    type: "circle",
    source: "official-observations",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["get", "count"], 1, 6, 5, 9, 20, 13],
      "circle-color": "#163f46",
      "circle-opacity": 0.9,
      "circle-stroke-color": "#79cbc7",
      "circle-stroke-width": 1.5,
    },
  });

  map.addLayer({
    id: "official-observation-counts",
    type: "symbol",
    source: "official-observations",
    layout: {
      "text-field": ["to-string", ["get", "count"]],
      "text-font": MAP_FONT_STACK,
      "text-size": 9,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: { "text-color": "#e3f4f2" },
  });

  map.addSource("events", {
    type: "geojson",
    data: eventsToFeatureCollection(events),
    cluster: true,
    clusterMaxZoom: 5,
    clusterRadius: 52,
  });

  map.addSource("selected-event", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  map.addSource("event-relations", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  map.addLayer({
    id: "event-relations",
    type: "line",
    source: "event-relations",
    paint: {
      "line-color": ["match", ["get", "index"], 0, "#4386d1", "#c58a35"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 1, 1, 6, 2.2],
      "line-opacity": 0.82,
      "line-dasharray": [2, 2],
    },
  });

  map.addLayer({
    id: "event-clusters",
    type: "circle",
    source: "events",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#16384a",
      "circle-stroke-color": "#75a9c0",
      "circle-stroke-width": 1.5,
      "circle-radius": ["step", ["get", "point_count"], 18, 4, 23, 10, 28],
      "circle-opacity": 0.96,
    },
  });

  map.addLayer({
    id: "event-cluster-count",
    type: "symbol",
    source: "events",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": MAP_FONT_STACK,
      "text-size": 11,
    },
    paint: { "text-color": "#edf6f8" },
  });

  map.addLayer({
    id: "selected-event-halo",
    type: "circle",
    source: "selected-event",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 14, 8, 20],
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-color": [
        "match", ["get", "category"],
        "korea-core", CATEGORY_META["korea-core"].color,
        "us-impact", CATEGORY_META["us-impact"].color,
        CATEGORY_META["rapid-change"].color,
      ],
      "circle-stroke-width": 2,
      "circle-opacity": 0.95,
    },
  });

  map.addLayer({
    id: "event-points",
    type: "circle",
    source: "events",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 8, 8, 12],
      "circle-color": [
        "match", ["get", "category"],
        "korea-core", CATEGORY_META["korea-core"].color,
        "us-impact", CATEGORY_META["us-impact"].color,
        CATEGORY_META["rapid-change"].color,
      ],
      "circle-stroke-color": "#071923",
      "circle-stroke-width": 3,
      "circle-opacity": 0.96,
    },
  });

  map.addLayer({
    id: "event-point-labels",
    type: "symbol",
    source: "events",
    filter: ["!", ["has", "point_count"]],
    layout: {
      "text-field": ["get", "shortId"],
      "text-font": MAP_FONT_STACK,
      "text-size": 9,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: { "text-color": "#f3f8fa" },
  });
}

export function WorldSituationMap({
  events,
  observations = [],
  selectedEvent,
  selectionActive,
  dataStatus = "non-live-demo",
  sourceStatus = "idle",
  onSelect,
  onOpenIssues,
  onOpenOfficialIssues,
  onOpenAi,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const eventsRef = useRef(events);
  const observationsRef = useRef(observations);
  const onSelectRef = useRef(onSelect);
  const previousEventIdRef = useRef(selectedEvent.id);
  const previousSelectionActiveRef = useRef(selectionActive);
  const [worldOverview, setWorldOverview] = useState(() => getStoredMapView().overview === true);
  const worldOverviewRef = useRef(worldOverview);
  const [mapReady, setMapReady] = useState(false);
  const [mapStatus, setMapStatus] = useState("loading");
  const [activeLayers, setActiveLayers] = useState(() => new Set(LAYERS.map(({ id }) => id)));
  const [cursorCoordinate, setCursorCoordinate] = useState(selectedEvent.coordinates);
  const [camera, setCamera] = useState({ ...KOREA_VIEW, bearing: 0 });
  const [popoverOpen, setPopoverOpen] = useState(() => !window.matchMedia("(max-width: 600px)").matches);
  const [selectedObservationId, setSelectedObservationId] = useState(null);

  eventsRef.current = events;
  observationsRef.current = observations;
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return undefined;

    const initialView = getStoredMapView();
    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: MAP_STYLE_URL,
      center: initialView.center,
      zoom: initialView.zoom,
      bearing: initialView.bearing ?? 0,
      pitch: initialView.pitch ?? 0,
      minZoom: -1,
      maxZoom: 13,
      hash: "map",
      renderWorldCopies: false,
      attributionControl: false,
      localIdeographFontFamily: "'Noto Sans KR Variable', 'Apple SD Gothic Neo', sans-serif",
    });
    let styleBooted = false;
    let mapLoaded = false;
    let hadResourceError = false;
    let pointerFrame = 0;
    let resourceTimeout = 0;
    mapRef.current = map;
    map.addControl(new AttributionControl({ compact: false }), "bottom-right");
    const styleTimeout = window.setTimeout(() => {
      if (!styleBooted) setMapStatus("error");
    }, 12_000);

    const updateCamera = () => {
      const center = map.getCenter();
      setCamera({ center: [center.lng, center.lat], zoom: map.getZoom(), bearing: map.getBearing() });
      saveMapView(map, worldOverviewRef.current);
    };

    const handleMouseMove = (event) => {
      const coordinate = [event.lngLat.lng, event.lngLat.lat];
      window.cancelAnimationFrame(pointerFrame);
      pointerFrame = window.requestAnimationFrame(() => setCursorCoordinate(coordinate));
    };
    const handleClusterClick = async (event) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: ["event-clusters"] })[0];
      if (!feature) return;
      try {
        const source = map.getSource("events");
        const zoom = await source.getClusterExpansionZoom(feature.properties.cluster_id);
        map.easeTo({ center: feature.geometry.coordinates, zoom });
      } catch {
        setMapStatus("degraded");
      }
    };
    const handleEventClick = (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      setSelectedObservationId(null);
      onSelectRef.current(Number(feature.properties.id));
      setPopoverOpen(true);
    };
    const handleObservationClick = (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      setSelectedObservationId(String(feature.properties.id));
      setPopoverOpen(false);
      setCursorCoordinate(feature.geometry.coordinates);
    };
    const showPointer = () => { map.getCanvas().style.cursor = "pointer"; };
    const restorePointer = () => { map.getCanvas().style.cursor = ""; };

    map.once("style.load", () => {
      styleBooted = true;
      window.clearTimeout(styleTimeout);
      localizeBasemapLabels(map);
      addIntelligenceLayers(map, eventsRef.current, observationsRef.current);
      setMapReady(true);
      setMapStatus("loading");
      resourceTimeout = window.setTimeout(() => {
        if (!mapLoaded) setMapStatus("degraded");
      }, 15_000);
      updateCamera();
    });
    map.once("load", () => {
      mapLoaded = true;
      window.clearTimeout(resourceTimeout);
      setMapStatus(hadResourceError ? "degraded" : "ready");
    });
    map.on("error", (event) => {
      if (!event?.error) return;
      if (!styleBooted) setMapStatus("error");
      else {
        hadResourceError = true;
        setMapStatus("degraded");
      }
    });
    map.on("mousemove", handleMouseMove);
    map.on("moveend", updateCamera);
    map.on("click", "event-clusters", handleClusterClick);
    map.on("click", "event-points", handleEventClick);
    map.on("click", "official-observation-points", handleObservationClick);
    map.on("mouseenter", "event-clusters", showPointer);
    map.on("mouseleave", "event-clusters", restorePointer);
    map.on("mouseenter", "event-points", showPointer);
    map.on("mouseleave", "event-points", restorePointer);
    map.on("mouseenter", "official-observation-points", showPointer);
    map.on("mouseleave", "official-observation-points", restorePointer);

    return () => {
      window.clearTimeout(styleTimeout);
      window.clearTimeout(resourceTimeout);
      window.cancelAnimationFrame(pointerFrame);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    map?.getSource("official-observations")?.setData(observationsToFeatureCollection(observations));
    const visibility = activeLayers.has("official-observations") ? "visible" : "none";
    ["official-observation-halos", "official-observation-points", "official-observation-counts"].forEach((layerId) => {
      if (map?.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", visibility);
    });
    if (!observations.some(({ id }) => String(id) === String(selectedObservationId))) setSelectedObservationId(null);
  }, [activeLayers, mapReady, observations, selectedObservationId]);

  useEffect(() => {
    if (!mapReady) return;
    const visibleEvents = getVisibleEvents(events, activeLayers);
    mapRef.current?.getSource("events")?.setData(eventsToFeatureCollection(visibleEvents));
  }, [activeLayers, events, mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    const selectedVisible = selectionActive && activeLayers.has(selectedEvent.category);
    map?.getSource("selected-event")?.setData(eventsToFeatureCollection(selectedVisible ? [selectedEvent] : []));
    map?.getSource("event-relations")?.setData(relationsToFeatureCollection(
      selectedVisible && activeLayers.has("supply") ? getEventRelations(selectedEvent) : [],
    ));
    if (map?.getLayer("event-relations")) {
      map.setLayoutProperty("event-relations", "visibility", activeLayers.has("supply") ? "visible" : "none");
    }
    if (selectedVisible) setCursorCoordinate(selectedEvent.coordinates);
    const selectionJustActivated = selectionActive && !previousSelectionActiveRef.current;
    if (selectedVisible && (selectionJustActivated || previousEventIdRef.current !== selectedEvent.id)) {
      setPopoverOpen(true);
      worldOverviewRef.current = false;
      setWorldOverview(false);
      window.requestAnimationFrame(() => {
        map?.resize();
        map?.flyTo({ center: selectedEvent.coordinates, zoom: Math.max(map.getZoom(), 4.2), essential: false });
      });
    }
    previousEventIdRef.current = selectedEvent.id;
    previousSelectionActiveRef.current = selectionActive;
  }, [activeLayers, mapReady, selectedEvent, selectionActive]);

  const relation = useMemo(() => getEventRelations(selectedEvent)[0], [selectedEvent]);
  const selectedObservation = useMemo(() => (
    observations.find(({ id }) => String(id) === String(selectedObservationId)) ?? null
  ), [observations, selectedObservationId]);
  const observationRegionCount = observations.length;

  function toggleLayer(id) {
    if (id === "official-observations") setSelectedObservationId(null);
    setActiveLayers((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function moveTo(view) {
    const map = mapRef.current;
    if (!map) return;
    worldOverviewRef.current = false;
    setWorldOverview(false);
    window.requestAnimationFrame(() => {
      map.resize();
      map.flyTo({ center: view.center, zoom: view.zoom, bearing: 0, pitch: 0, essential: false });
    });
  }

  function showWorld() {
    const map = mapRef.current;
    if (!map) return;
    const mobileOverview = map.getContainer().clientWidth < 600;
    worldOverviewRef.current = mobileOverview;
    setWorldOverview(mobileOverview);
    window.requestAnimationFrame(() => {
      map.resize();
      const containerWidth = map.getContainer().clientWidth;
      const horizontalPadding = containerWidth < 600 ? 18 : 48;
      const worldZoom = Math.log2(Math.max(1, containerWidth - horizontalPadding * 2) / 512);
      map.flyTo({
        center: [0, 18],
        zoom: Math.max(map.getMinZoom(), worldZoom),
        bearing: 0,
        pitch: 0,
        essential: false,
      });
    });
  }

  return (
    <section className={`map-frame${worldOverview ? " is-world-overview" : ""}`} aria-label="세계 사건 상황지도">
      <div className="maplibre-map" ref={mapContainerRef} aria-label="확대와 이동이 가능한 오픈소스 지도" />
      <div className="map-data-cluster" aria-label="지도 데이터 상태">
        {mapStatus === "ready" ? "지도 준비됨" : mapStatus === "degraded" ? "일부 지도 지연" : mapStatus === "error" ? "지도 연결 오류" : "지도 불러오는 중"}
        <span>·</span> 사건 {events.length}건({dataStatus === "non-live-demo" || dataStatus === "fallback-demo" ? "데모" : dataStatus === "mixed" ? "혼합" : "검토"})
        <span>·</span> 공식 관측 {observationRegionCount}개 지역({sourceStatus === "error" ? "불러오기 실패" : "검증 전"}) <span>·</span> OpenStreetMap 기반
      </div>
      <div className={`map-mobile-status is-${mapStatus}`} role="status">
        {mapStatus === "ready" ? "지도 준비됨" : mapStatus === "degraded" ? "일부 지연" : mapStatus === "error" ? "연결 오류" : "불러오는 중"} · 관측 {observationRegionCount}개 지역
      </div>

      <div className="layer-controls" aria-label="지도 레이어">
        <div className="layer-heading"><Stack size={14} /> 레이어</div>
        {LAYERS.map(({ id, label, icon: Icon }) => (
          <button type="button" key={id} className={activeLayers.has(id) ? "is-active" : ""}
            onClick={() => toggleLayer(id)} aria-pressed={activeLayers.has(id)}>
            <Icon size={17} aria-hidden="true" />{label}
          </button>
        ))}
      </div>

      <div className="map-controls" aria-label="지도 탐색">
        <button type="button" onClick={() => mapRef.current?.zoomIn()} aria-label="지도 확대"><Plus size={19} /></button>
        <button type="button" onClick={() => mapRef.current?.zoomOut()} aria-label="지도 축소"><Minus size={19} /></button>
        <button type="button" onClick={() => moveTo(KOREA_VIEW)} aria-label="대한민국 중심으로 이동"><Crosshair size={18} /></button>
        <button type="button" onClick={showWorld} aria-label="세계 전체 보기"><GlobeHemisphereWest size={18} /></button>
      </div>

      <div className="map-camera-readout" aria-label="현재 지도 보기">
        <span>확대 {camera.zoom.toFixed(2)}</span>
        <span>{camera.center[1].toFixed(4)}, {camera.center[0].toFixed(4)}</span>
        <small>드래그로 이동 · 스크롤로 확대</small>
      </div>
      <output className="coordinate-readout" aria-label="지도 커서 좌표">
        {formatCoordinate(cursorCoordinate[1], "N", "S")} &nbsp; {formatCoordinate(cursorCoordinate[0], "E", "W")}
      </output>

      {mapStatus === "error" && (
        <div className="map-error" role="status">
          공개 지도 타일을 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.
        </div>
      )}

      {popoverOpen && selectionActive && activeLayers.has(selectedEvent.category) && (
        <section className="event-popover" aria-label={`${selectedEvent.title} 선택 사건`}>
          <button className="popover-close" type="button" onClick={() => setPopoverOpen(false)} aria-label="선택 사건 팝오버 닫기"><X size={18} /></button>
          <div className="popover-meta">
            <strong>{String(selectedEvent.id).padStart(2, "0")}</strong>
            <span>{selectedEvent.region} · {selectedEvent.time} KST</span>
          </div>
          <h2>{selectedEvent.title}</h2>
          <p>{selectedEvent.summary}</p>
          <div className="popover-evidence">
            <span>출처 {selectedEvent.sources}</span><span>합치도 {selectedEvent.agreement}%</span>
            <strong>{STATUS_META[selectedEvent.status]?.label ?? "상태 미분류"}</strong>
          </div>
          {relation && <p className="relation-label"><ShieldCheck size={15} /> 연결 관계&nbsp; {selectedEvent.region} → {relation.to.label} · {selectedEvent.relationLabel}</p>}
          <div className="popover-actions">
            <button type="button" onClick={onOpenIssues}>이슈 분석 보기 <ArrowSquareOut size={16} /></button>
            <button type="button" onClick={onOpenAi}><Brain size={17} /> Mandos에 묻기</button>
          </div>
        </section>
      )}

      {selectedObservation && activeLayers.has("official-observations") && (
        <section className="official-observation-popover" aria-label={`${selectedObservation.label} 공식 관측`}>
          <button className="popover-close" type="button" onClick={() => setSelectedObservationId(null)} aria-label="공식 관측 닫기"><X size={18} /></button>
          <div className="observation-popover-heading">
            <span>공식 관측 · 사건 검증 전</span>
            <strong>{selectedObservation.label} 관련 발표 {selectedObservation.count}건</strong>
          </div>
          <p>공식 발표 제목에서 지역명이 직접 확인된 자료를 묶었습니다. 원의 위치는 지역 중심점이며 사건 발생 위치가 아닙니다.</p>
          <ol>
            {selectedObservation.items.map((item) => (
              <li key={item.id ?? item.originalUrl}>
                <a href={item.originalUrl} target="_blank" rel="noopener noreferrer">
                  <span>{item.title}</span><ArrowSquareOut size={14} aria-hidden="true" />
                </a>
                <small>{item.source?.name ?? "공식 출처"} · {formatObservationTime(item.publishedAt ?? item.collectedAt)}</small>
              </li>
            ))}
          </ol>
          <button className="observation-issues-link" type="button" onClick={onOpenOfficialIssues}>이슈 추적에서 함께 보기 <ArrowSquareOut size={15} /></button>
        </section>
      )}
    </section>
  );
}
