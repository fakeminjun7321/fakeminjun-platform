import React, { useEffect, useMemo, useRef, useState } from "react";
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

const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
const KOREA_VIEW = Object.freeze({ center: [126.98, 37.56], zoom: 4.8 });
const MAP_VIEW_STORAGE_KEY = "intel-workspace:international-map-view";
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
  KOREAN_LABEL_LAYERS.forEach((layerId) => {
    if (!map.getLayer(layerId)) return;
    map.setLayoutProperty(layerId, "text-field", textField);
    if (["place_town", "place_city", "place_city_large"].includes(layerId)) {
      map.setLayoutProperty(layerId, "icon-image", "");
    }
  });
}

function addIntelligenceLayers(map, events) {
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
      "text-size": 9,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: { "text-color": "#f3f8fa" },
  });
}

export function WorldSituationMap({ events, selectedEvent, selectionActive, dataStatus = "non-live-demo", onSelect, onOpenIssues, onOpenAi }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const eventsRef = useRef(events);
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

  eventsRef.current = events;
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
      onSelectRef.current(Number(feature.properties.id));
      setPopoverOpen(true);
    };
    const showPointer = () => { map.getCanvas().style.cursor = "pointer"; };
    const restorePointer = () => { map.getCanvas().style.cursor = ""; };

    map.once("style.load", () => {
      styleBooted = true;
      window.clearTimeout(styleTimeout);
      localizeBasemapLabels(map);
      addIntelligenceLayers(map, eventsRef.current);
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
    map.on("mouseenter", "event-clusters", showPointer);
    map.on("mouseleave", "event-clusters", restorePointer);
    map.on("mouseenter", "event-points", showPointer);
    map.on("mouseleave", "event-points", restorePointer);

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

  function toggleLayer(id) {
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
        {mapStatus === "ready" ? "OPEN MAP READY" : mapStatus === "degraded" ? "MAP DEGRADED" : mapStatus === "error" ? "BASEMAP ERROR" : "MAP LOADING"}
        <span>·</span> 신호 {events.length} <span>·</span> {dataStatus === "non-live-demo" || dataStatus === "fallback-demo" ? "데모 자료" : dataStatus === "mixed" ? "실제·데모 혼합" : "API 자료"} <span>·</span> OSM 기반
      </div>
      <div className={`map-mobile-status is-${mapStatus}`} role="status">
        {mapStatus === "ready" ? "MAP READY" : mapStatus === "degraded" ? "MAP DEGRADED" : mapStatus === "error" ? "MAP ERROR" : "MAP LOADING"}
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

      <div className="map-controls" aria-label="지도 탐색">
        <button type="button" onClick={() => mapRef.current?.zoomIn()} aria-label="지도 확대"><Plus size={19} /></button>
        <button type="button" onClick={() => mapRef.current?.zoomOut()} aria-label="지도 축소"><Minus size={19} /></button>
        <button type="button" onClick={() => moveTo(KOREA_VIEW)} aria-label="대한민국 중심으로 이동"><Crosshair size={18} /></button>
        <button type="button" onClick={showWorld} aria-label="세계 전체 보기"><GlobeHemisphereWest size={18} /></button>
      </div>

      <div className="map-camera-readout" aria-label="현재 지도 보기">
        <span>ZOOM {camera.zoom.toFixed(2)}</span>
        <span>{camera.center[1].toFixed(4)}, {camera.center[0].toFixed(4)}</span>
        <small>DRAG · SCROLL / PINCH · URL SYNC</small>
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
            <button type="button" onClick={onOpenAi}><Brain size={17} /> AI에 묻기</button>
          </div>
        </section>
      )}
    </section>
  );
}
