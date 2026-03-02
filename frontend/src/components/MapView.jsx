import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import mapboxgl from "mapbox-gl";
import { useMapbox } from "../hooks/useMapbox.js";
import CandidateMarker from "./CandidateMarker.jsx";

export default function MapView({
  candidates,
  center,
  onCandidateSelect,
  selectedCandidate,
}) {
  const containerRef = useRef(null);
  const markersRef = useRef([]);
  const { map, mapLoaded } = useMapbox(containerRef, center);
  const token = import.meta.env.VITE_MAPBOX_TOKEN;

  useEffect(() => {
    if (!map || !mapLoaded) return;
    // clear existing markers
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
      const marker = new mapboxgl.Marker(el).setLngLat([lng, lat]).addTo(map);
      markersRef.current.push(marker);
    });
  }, [candidates, map, mapLoaded, onCandidateSelect, selectedCandidate]);

  if (!token || token.includes("your_mapbox_public_token_here")) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-900 text-sm text-gray-300">
        Add <code className="mx-1">VITE_MAPBOX_TOKEN</code> to <code>.env</code> to enable the map.
      </div>
    );
  }

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

