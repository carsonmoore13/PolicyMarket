import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import CandidateMarker from "./CandidateMarker.jsx";

export default function MapView({
  candidates,
  center,
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

  // Fly to ZIP center when it changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;
    const [lng, lat] = center;
    if (typeof lng === "number" && typeof lat === "number") {
      map.flyTo([lat, lng], 10, { duration: 1.0 });
    }
  }, [center]);

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

      const marker = L.marker([lat, lng], { icon }).addTo(map);
      markersRef.current.push(marker);
    });
  }, [candidates, onCandidateSelect, selectedCandidate]);

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

