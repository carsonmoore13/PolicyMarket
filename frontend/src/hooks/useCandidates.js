import { useEffect, useState } from "react";
import { fetchCandidates } from "../api/client.js";

/**
 * Fetches candidates for the given address + sidebar level.
 *
 * @param {{ street: string, city: string, state: string, zip?: string }|null} address
 * @param {"federal"|"state"|"local"} level
 */
export function useCandidates(address, level) {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // True when the backend has triggered background Ballotpedia discovery
  const [discovering, setDiscovering] = useState(false);

  useEffect(() => {
    if (!address?.street || !address?.city || !address?.state) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setDiscovering(false);
      try {
        const { candidates: data, discovering: isDiscovering } = await fetchCandidates(address, level);
        if (!cancelled) {
          setCandidates(data);
          setDiscovering(isDiscovering);
        }
      } catch (err) {
        if (!cancelled) {
          const msg =
            err.response?.data?.error || "Unable to fetch candidates for this address.";
          setError(msg);
          setCandidates([]);
          setDiscovering(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [address?.street, address?.city, address?.state, level]);

  return { candidates, loading, error, discovering };
}
