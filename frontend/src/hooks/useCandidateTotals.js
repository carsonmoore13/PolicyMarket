import { useEffect, useState } from "react";
import { fetchAllCandidates } from "../api/client.js";

export function useCandidateTotals() {
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchAllCandidates();
        if (cancelled) return;
        // Backend now returns { federal, state, local, total } directly
        if (data && typeof data.federal === "number") {
          setTotals({ federal: data.federal, state: data.state, local: data.local });
        } else {
          // Fallback for old array response format
          const counts = (Array.isArray(data) ? data : []).reduce(
            (acc, c) => {
              const lvl = (c.office_level || "").toLowerCase();
              if (lvl === "federal") acc.federal += 1;
              else if (lvl === "state") acc.state += 1;
              else if (lvl === "city" || lvl === "local") acc.local += 1;
              return acc;
            },
            { federal: 0, state: 0, local: 0 },
          );
          setTotals(counts);
        }
      } catch (err) {
        if (!cancelled) {
          setError("Unable to load candidate totals.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { totals, loading, error };
}

