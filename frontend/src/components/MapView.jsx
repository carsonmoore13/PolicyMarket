import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import CandidateMarker from "./CandidateMarker.jsx";
import { getDistrictCentroid } from "../utils/districtCentroids.js";

// Default state center (Texas) used when a candidate has no geo data.
const TX_CENTER = { lat: 31.0, lng: -98.5 };

/**
 * Resolve the base map position for a candidate.
 * Priority: district centroid > geo fields > state center fallback.
 */
function resolveBasePosition(c) {
  const geo = c.geo || {};
  let lat = geo.lat ?? null;
  let lng = geo.lng ?? null;

  // Fallback to GeoJSON point coordinates
  if (lat == null || lng == null) {
    const coords = geo.geojson_point?.coordinates;
    if (coords) {
      lng = coords[0];
      lat = coords[1];
    }
  }

  // Override with district centroid when available
  if (c.district) {
    const dGeo = getDistrictCentroid(c.district, { lat, lng });
    lat = dGeo.lat;
    lng = dGeo.lng;
  }

  // Final fallback — state center so every candidate gets a marker
  if (typeof lat !== "number" || typeof lng !== "number") {
    lat = TX_CENTER.lat;
    lng = TX_CENTER.lng;
  }

  return { lat, lng };
}

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

  // Track whether the user is actively interacting with the map.
  const userInteractingRef = useRef(false);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onStart = () => { userInteractingRef.current = true; };
    const onEnd = () => { userInteractingRef.current = false; };
    map.on("zoomstart mousedown touchstart", onStart);
    map.on("zoomend  mouseup  touchend", onEnd);
    return () => {
      map.off("zoomstart mousedown touchstart", onStart);
      map.off("zoomend  mouseup  touchend", onEnd);
    };
  }, []);

  // Track the latest ZIP centroid so local zoom always snaps to the right city.
  const zipCenterRef = useRef(null);

  // Sidebar level -> map zoom preset.
  const prevLevelRef = useRef(level);
  const localZoomAppliedRef = useRef(false);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !level) return;

    const levelChanged = level !== prevLevelRef.current;
    if (levelChanged) {
      prevLevelRef.current = level;
      localZoomAppliedRef.current = false;
    }

    if (!levelChanged && !(level === "local" && !localZoomAppliedRef.current)) return;
    if (userInteractingRef.current) return;

    const PRESETS = { federal: 6, state: 7, local: 14 };
    const targetZoom = PRESETS[level];
    if (typeof targetZoom === "number") {
      let flyCenter = map.getCenter();
      if (level === "state") {
        flyCenter = [TX_CENTER.lat, TX_CENTER.lng];
      } else if (level === "local") {
        const pts = candidates
          .map((c) => {
            const pos = resolveBasePosition(c);
            return [pos.lat, pos.lng];
          })
          .filter(([lat, lng]) => typeof lat === "number" && typeof lng === "number");

        if (pts.length > 0) {
          const avgLat = pts.reduce((s, p) => s + p[0], 0) / pts.length;
          const avgLng = pts.reduce((s, p) => s + p[1], 0) / pts.length;
          flyCenter = [avgLat, avgLng];
          localZoomAppliedRef.current = true;
        } else {
          flyCenter = zipCenterRef.current ?? map.getCenter();
        }
      }
      map.flyTo(flyCenter, targetZoom, { duration: 0.8 });
    }
  }, [level, candidates]);

  // Fly to ZIP center when it changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;
    const [lng, lat] = center;
    if (typeof lng === "number" && typeof lat === "number") {
      zipCenterRef.current = [lat, lng];
      const currentZoom = map.getZoom();
      map.flyTo([lat, lng], currentZoom, { duration: 1.0 });
    }
  }, [center]);

  // ── Spatial placement: group candidates by base position & spread radially ──
  // Update markers when candidates change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Step 1: Resolve base positions for all candidates
    const withBase = candidates.map((c) => {
      const pos = resolveBasePosition(c);
      return { c, baseLat: pos.lat, baseLng: pos.lng };
    });

    // Step 2: Group candidates that share the same base position
    const groupMap = {};
    withBase.forEach((item) => {
      // Round to 3 decimals (~100m) so nearby centroids cluster together
      const key = `${item.baseLat.toFixed(3)}|${item.baseLng.toFixed(3)}`;
      (groupMap[key] ??= []).push(item);
    });

    // Step 3: Compute final positions with radial spread within each group
    const placed = [];
    for (const group of Object.values(groupMap)) {
      const n = group.length;
      if (n === 1) {
        placed.push({ c: group[0].c, lat: group[0].baseLat, lng: group[0].baseLng });
        continue;
      }

      // Determine if this is a statewide cluster (candidates without districts)
      const statewideCount = group.filter((g) => !g.c.district).length;
      const isStatewideCluster = statewideCount > n / 2;

      // Spread radius in degrees:
      //   Statewide: 0.3° + 0.06° per candidate (~35-100km) — visible at zoom 6-7
      //   District:  0.02° + 0.004° per candidate (~2-4km) — visible at zoom 8-10
      const spread = isStatewideCluster
        ? 0.3 + n * 0.06
        : 0.02 + n * 0.004;

      // Sort group for deterministic ordering: D before R, then alphabetical
      group.sort((a, b) => {
        const pa = (a.c.party || "").toUpperCase();
        const pb = (b.c.party || "").toUpperCase();
        if (pa !== pb) return pa < pb ? -1 : 1;
        return (a.c.name || "").localeCompare(b.c.name || "");
      });

      group.forEach((item, i) => {
        const angle = (2 * Math.PI * i) / n - Math.PI / 2; // start from top
        placed.push({
          c: item.c,
          lat: item.baseLat + spread * Math.sin(angle),
          lng: item.baseLng + spread * Math.cos(angle),
        });
      });
    }

    // Step 4: Create Leaflet markers
    placed.forEach(({ c, lat, lng }) => {
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
        iconSize: [56, 72],
        iconAnchor: [28, 56],
      });

      const marker = L.marker([lat, lng], { icon }).addTo(map);
      markersRef.current.push(marker);
    });
  }, [candidates, onCandidateSelect, selectedCandidate]);

  // When a candidate is selected from the sidebar, zoom to their location
  useEffect(() => {
    const map = mapRef.current;
    const c = selectedCandidate;
    if (!map || !c) return;

    const pos = resolveBasePosition(c);
    if (typeof pos.lat !== "number" || typeof pos.lng !== "number") return;

    let targetZoom = map.getZoom();
    const lvl = (c.office_level || "").toLowerCase();
    if (lvl === "federal") targetZoom = 9;
    else if (lvl === "state") targetZoom = 8;
    else if (lvl === "city") targetZoom = 13;

    map.flyTo([pos.lat, pos.lng], targetZoom, { duration: 0.9 });
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

