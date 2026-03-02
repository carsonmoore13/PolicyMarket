import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";

export function useMapbox(containerRef, initialCenter) {
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapRef = useRef(null);

  useEffect(() => {
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    if (!token || token.includes("your_mapbox_public_token_here")) {
      return;
    }
    if (!containerRef.current) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: initialCenter || [-97.7431, 30.2672],
      zoom: initialCenter ? 10 : 4,
    });
    mapRef.current = map;
    map.on("load", () => setMapLoaded(true));
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [containerRef, initialCenter]);

  useEffect(() => {
    if (initialCenter && mapRef.current && mapLoaded) {
      mapRef.current.flyTo({
        center: initialCenter,
        zoom: 10,
        duration: 1500,
      });
    }
  }, [initialCenter, mapLoaded]);

  return { map: mapRef.current, mapLoaded };
}

