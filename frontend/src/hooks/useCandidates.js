import { useEffect, useState } from "react";
import { fetchCandidates } from "../api/client.js";

export function useCandidates(zip, level) {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!zip || !/^\d{5}$/.test(zip)) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchCandidates(zip, level);
        if (!cancelled) setCandidates(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) {
          const msg =
            err.response?.data?.error || "Unable to fetch candidates for ZIP.";
          setError(msg);
          setCandidates([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [zip, level]);

  return { candidates, loading, error };
}

