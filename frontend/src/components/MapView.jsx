import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import CandidateMarker from "./CandidateMarker.jsx";

export default function MapView({
  candidates,
  center,
  level,
  onCandidateSelect,
  selectedCandidate,
  onLevelFromZoom,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  // Initialize Leaflet map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [30.2672, -97.7431],
      zoom: 4,
      minZoom: 3,
      maxZoom: 16,
    });
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 20,
      },
    ).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Map zoom -> level mapping
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !onLevelFromZoom) return;

    const handleZoom = () => {
      const z = map.getZoom();
      let nextLevel = "federal";
      if (z >= 10) nextLevel = "local";
      else if (z >= 6) nextLevel = "state";
      onLevelFromZoom(nextLevel);
    };

    map.on("zoomend", handleZoom);
    return () => {
      map.off("zoomend", handleZoom);
    };
  }, [onLevelFromZoom]);

  // Sidebar level -> map zoom snapping
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !level) return;

    let targetZoom;
    if (level === "federal") targetZoom = 4;
    else if (level === "state") targetZoom = 7;
    else if (level === "local") targetZoom = 11;

    if (typeof targetZoom === "number" && map.getZoom() !== targetZoom) {
      map.setZoom(targetZoom);
    }
  }, [level]);

  // Fly to ZIP center when it changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;
    const [lng, lat] = center;
    if (typeof lng === "number" && typeof lat === "number") {
      const currentZoom = map.getZoom();
      map.flyTo([lat, lng], currentZoom, { duration: 1.0 });
    }
  }, [center]);

  // Deterministic small offset so multiple candidates in the same district
  // don't sit exactly on top of each other.
  function jitterLatLng(lat, lng, key) {
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) {
      hash = (hash * 31 + key.charCodeAt(i)) | 0;
    }
    const angle = ((hash % 360) * Math.PI) / 180;
    const radiusDeg = 0.02 * ((hash & 0xff) / 255); // up to ~2km
    const dLat = radiusDeg * Math.sin(angle);
    const dLng = radiusDeg * Math.cos(angle);
    return [lat + dLat, lng + dLng];
  }

  // Update markers when candidates change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    candidates.forEach((c) => {
      const geo = c.geo || {};
      let lng = geo.lng;
      let lat = geo.lat;
      if ((!lng || !lat) && geo.geojson_point?.coordinates) {
        [lng, lat] = geo.geojson_point.coordinates;
      }
      if (typeof lng !== "number" || typeof lat !== "number") return;

      const [jLat, jLng] = jitterLatLng(
        lat,
        lng,
        `${c.name || ""}|${c.office || ""}|${c.district || ""}`,
      );

      const el = document.createElement("div");
      const root = createRoot(el);
      root.render(
        <CandidateMarker
          candidate={c}
          isSelected={selectedCandidate && selectedCandidate._id === c._id}
          onClick={() => onCandidateSelect?.(c)}
        />,
      );

      const icon = L.divIcon({
        html: el,
        className: "pm-marker-wrapper",
        iconSize: [44, 44],
      });

      const marker = L.marker([jLat, jLng], { icon }).addTo(map);
      markersRef.current.push(marker);
    });
  }, [candidates, onCandidateSelect, selectedCandidate]);

  // When a candidate is selected from the sidebar, zoom to their location
  useEffect(() => {
    const map = mapRef.current;
    const c = selectedCandidate;
    if (!map || !c || !c.geo) return;

    let { lng, lat } = c.geo;
    if ((!lng || !lat) && c.geo.geojson_point?.coordinates) {
      [lng, lat] = c.geo.geojson_point.coordinates;
    }
    if (typeof lng !== "number" || typeof lat !== "number") return;

    let targetZoom = map.getZoom();
    const lvl = (c.office_level || "").toLowerCase();
    if (lvl === "federal") targetZoom = 4;
    else if (lvl === "state") targetZoom = 7;
    else if (lvl === "city") targetZoom = 11;

    map.flyTo([lat, lng], targetZoom, { duration: 0.9 });
  }, [selectedCandidate]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {candidates.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
          <div className="rounded bg-slate-900/80 px-3 py-1 text-xs text-gray-200">
            No candidates found in this area.
          </div>
        </div>
      )}
    </div>
  );
}

