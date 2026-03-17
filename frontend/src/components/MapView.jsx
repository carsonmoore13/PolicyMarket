import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import CandidateMarker from "./CandidateMarker.jsx";
import { getDistrictCentroid } from "../utils/districtCentroids.js";
import { fetchDistrictBoundary, fetchStateOutline } from "../api/client.js";

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

// ── District boundary styling ────────────────────────────────────────────────

/**
 * Determine which districts to highlight for the current level + sublevel.
 * Returns an array of { district, type, isStateOutline } objects.
 */
// Statewide office sublevels that should show the Texas outline
const STATEWIDE_SUBLEVELS = new Set([
  "governor", "lt_governor", "attorney_general",
  "ag_commissioner", "land_commissioner", "statewide",
]);

function getDistrictsForLevel(level, sublevel, districts) {
  if (!districts && !sublevel) return [];

  if (level === "federal") {
    // No sublevel or US Senate → statewide → show Texas outline
    if (!sublevel || sublevel === "us_senate") {
      return [{ district: null, type: "state_outline", isStateOutline: true }];
    }
    // US House → show congressional district
    if (sublevel === "us_house" && districts?.congressional) {
      return [{ district: districts.congressional, type: "congressional" }];
    }
    // Fallback: show state outline
    return [{ district: null, type: "state_outline", isStateOutline: true }];
  }

  if (level === "state") {
    // No sublevel or any statewide office → show Texas outline
    if (!sublevel || STATEWIDE_SUBLEVELS.has(sublevel)) {
      return [{ district: null, type: "state_outline", isStateOutline: true }];
    }
    if (sublevel === "state_senate" && districts?.state_senate) {
      return [{ district: districts.state_senate, type: "state_senate" }];
    }
    if (sublevel === "state_house" && districts?.state_house) {
      return [{ district: districts.state_house, type: "state_house" }];
    }
    // Fallback: show state outline
    return [{ district: null, type: "state_outline", isStateOutline: true }];
  }

  // Local: no Census TIGER boundaries available for city council
  return [];
}

/**
 * Create the multi-layer glow style for a boundary overlay.
 * Returns an array of Leaflet style objects from outermost (glow) to innermost (stroke).
 */
function getBoundaryStyles(type) {
  // Color palette: muted cool grays with subtle tint per type
  const palette = {
    congressional:  { hue: "180, 15%", accent: "#5b8a9a" },
    state_senate:   { hue: "210, 18%", accent: "#6b87a8" },
    state_house:    { hue: "220, 15%", accent: "#7b82a0" },
    state_outline:  { hue: "200, 12%", accent: "#8a9aaa" },
  };
  const p = palette[type] || palette.congressional;

  return [
    // Layer 0: Wide outer glow
    {
      color: p.accent,
      weight: 14,
      opacity: 0.06,
      fillColor: p.accent,
      fillOpacity: 0.02,
      lineCap: "round",
      lineJoin: "round",
    },
    // Layer 1: Medium glow
    {
      color: p.accent,
      weight: 7,
      opacity: 0.12,
      fill: false,
      lineCap: "round",
      lineJoin: "round",
    },
    // Layer 2: Core border — muted gray with slight color tint
    {
      color: p.accent,
      weight: 2.5,
      opacity: 0.45,
      fill: false,
      lineCap: "round",
      lineJoin: "round",
      dashArray: "8 4",
    },
    // Layer 3: Bright inner hairline
    {
      color: "#d4d4d8",
      weight: 0.8,
      opacity: 0.25,
      fill: false,
      lineCap: "round",
      lineJoin: "round",
    },
  ];
}

// In-memory cache so we don't re-fetch the same boundary
const _boundaryCache = {};

export default function MapView({
  candidates,
  center,
  level,
  sublevel,
  districts,
  onCandidateSelect,
  selectedCandidate,
  onLevelFromZoom,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const boundaryLayersRef = useRef([]);
  const boundaryLabelRef = useRef(null);

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

    const PRESETS = { federal: 6, state: 7 };
    if (level === "local") {
      const pts = candidates
        .map((c) => {
          const pos = resolveBasePosition(c);
          return [pos.lat, pos.lng];
        })
        .filter(([lat, lng]) => typeof lat === "number" && typeof lng === "number");

      if (pts.length > 0) {
        const bounds = L.latLngBounds(pts);
        map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 13, duration: 0.8 });
        localZoomAppliedRef.current = true;
      } else {
        const fallback = zipCenterRef.current ?? map.getCenter();
        map.flyTo(fallback, 12, { duration: 0.8 });
      }
    } else {
      const targetZoom = PRESETS[level];
      if (typeof targetZoom === "number") {
        let flyCenter = map.getCenter();
        if (level === "state") {
          flyCenter = [TX_CENTER.lat, TX_CENTER.lng];
        }
        map.flyTo(flyCenter, targetZoom, { duration: 0.8 });
      }
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

  // ── District boundary overlays ────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear previous boundary layers
    boundaryLayersRef.current.forEach((l) => map.removeLayer(l));
    boundaryLayersRef.current = [];
    if (boundaryLabelRef.current) {
      map.removeLayer(boundaryLabelRef.current);
      boundaryLabelRef.current = null;
    }

    const toFetch = getDistrictsForLevel(level, sublevel, districts);
    if (toFetch.length === 0) return;

    let cancelled = false;

    async function loadBoundaries() {
      for (const { district, type, isStateOutline } of toFetch) {
        if (cancelled) return;

        const cacheKey = isStateOutline ? "state_outline:TX" : `${type}:${district}`;
        let geojson = _boundaryCache[cacheKey];

        if (!geojson) {
          try {
            if (isStateOutline) {
              geojson = await fetchStateOutline();
            } else {
              geojson = await fetchDistrictBoundary(district, type);
            }
            _boundaryCache[cacheKey] = geojson;
          } catch {
            // Boundary not available — skip silently
            continue;
          }
        }

        if (cancelled || !geojson?.features?.length) continue;

        const styles = getBoundaryStyles(type);

        // Add layers from outermost glow to innermost stroke
        styles.forEach((style) => {
          const layer = L.geoJSON(geojson, {
            style: () => style,
            interactive: false,
          });
          layer.addTo(map);
          boundaryLayersRef.current.push(layer);

          // Animate fade-in via CSS class
          layer.eachLayer((pathLayer) => {
            const el = pathLayer.getElement?.();
            if (el) {
              el.classList.add("pm-boundary-layer");
              // Stagger entrance slightly for each glow ring
              el.style.animationDelay = `${styles.indexOf(style) * 80}ms`;
            }
          });
        });

        // Zoom to fit the boundary polygon
        const fitLayer = L.geoJSON(geojson);
        const bounds = fitLayer.getBounds();
        if (bounds.isValid() && !userInteractingRef.current) {
          const maxZoom = isStateOutline ? 7 : 12;
          map.flyToBounds(bounds, { padding: [50, 50], maxZoom, duration: 0.9 });
        }

        // Add a floating district label at the centroid of the boundary
        const feature = geojson.features[0];
        const rawName = feature.properties?.BASENAME
          || feature.properties?.NAME
          || district;
        let districtName;
        if (isStateOutline) {
          districtName = "Texas";
        } else if (type === "congressional") {
          districtName = `Congressional District ${rawName}`;
        } else if (type === "state_senate") {
          districtName = `State Senate District ${rawName}`;
        } else if (type === "state_house") {
          districtName = `State House District ${rawName}`;
        } else {
          districtName = rawName;
        }

        // Compute visual centroid from the boundary
        const labelCenter = bounds.getCenter();

        const labelIcon = L.divIcon({
          className: "pm-boundary-label-wrapper",
          html: `<div class="pm-boundary-label${isStateOutline ? " pm-boundary-label-state" : ""}">${districtName}</div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });

        const labelMarker = L.marker(labelCenter, {
          icon: labelIcon,
          interactive: false,
          zIndexOffset: -1000,
        });
        labelMarker.addTo(map);
        boundaryLayersRef.current.push(labelMarker);
      }
    }

    loadBoundaries();

    return () => {
      cancelled = true;
    };
  }, [level, sublevel, districts]);

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

      const statewideCount = group.filter((g) => !g.c.district).length;
      const isStatewideCluster = statewideCount > n / 2;

      const spread = isStatewideCluster
        ? 0.3 + n * 0.06
        : 0.02 + n * 0.004;

      group.sort((a, b) => {
        const pa = (a.c.party || "").toUpperCase();
        const pb = (b.c.party || "").toUpperCase();
        if (pa !== pb) return pa < pb ? -1 : 1;
        return (a.c.name || "").localeCompare(b.c.name || "");
      });

      group.forEach((item, i) => {
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
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
    else if (lvl === "city" || lvl === "local") targetZoom = 13;

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
