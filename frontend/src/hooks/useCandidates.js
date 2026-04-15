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
  /** @type {null | { districtName: string, filingOpens: string, filingOpensDisplay: string, beforeFilingOpens: boolean }} */
  const [schoolBoard, setSchoolBoard] = useState(null);
  /** @type {null | { localityName: string, filingOpens: string, filingOpensDisplay: string, beforeFilingOpens: boolean }} */
  const [mayoral, setMayoral] = useState(null);
  /** @type {null | { localityName: string, filingOpens: string, filingOpensDisplay: string, beforeFilingOpens: boolean, electionDate?: string }} */
  const [cityCouncil, setCityCouncil] = useState(null);
  /** @type {null | { localityName: string, filingOpens: string, filingOpensDisplay: string, beforeFilingOpens: boolean, electionDate?: string }} */
  const [township, setTownship] = useState(null);

  useEffect(() => {
    if (!address?.street || !address?.city || !address?.state) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setDiscovering(false);
      setSchoolBoard(null);
      setMayoral(null);
      setCityCouncil(null);
      setTownship(null);
      try {
        const {
          candidates: data,
          discovering: isDiscovering,
          school_board: sb,
          mayoral: my,
          city_council: cc,
          township: tw,
        } = await fetchCandidates(address, level);
        if (!cancelled) {
          setCandidates(data);
          setDiscovering(isDiscovering);
          setSchoolBoard(sb ?? null);
          setMayoral(my ?? null);
          setCityCouncil(cc ?? null);
          setTownship(tw ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          const msg =
            err.response?.data?.error || "Unable to fetch candidates for this address.";
          setError(msg);
          setCandidates([]);
          setDiscovering(false);
          setSchoolBoard(null);
          setMayoral(null);
          setCityCouncil(null);
          setTownship(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [address?.street, address?.city, address?.state, address?.zip, level]);

  return { candidates, loading, error, discovering, schoolBoard, mayoral, cityCouncil, township };
}
