import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:3001",
  timeout: 15000,
});

/**
 * Look up a voter's address and return location + districts.
 * @param {{ street: string, city: string, state: string, zip?: string }} addr
 */
export async function lookupAddress({ street, city, state, zip }) {
  const res = await api.get("/api/address-lookup", {
    params: { street, city, state, zip },
  });
  return res.data;
}

/**
 * Fetch candidates filtered for a specific address + tab level.
 * @param {{ street: string, city: string, state: string, zip?: string }} addr
 * @param {"federal"|"state"|"local"} level
 * @returns {{ candidates: object[], discovering: boolean }}
 */
export async function fetchCandidates(addr, level) {
  const res = await api.get("/api/candidates", {
    params: { ...addr, level },
    timeout: 60000, // allow extra time for first-time discovery on a new state
  });
  // Normalise: backend returns { candidates, discovering } but guard against
  // older cached responses that might be a plain array.
  const data = res.data;
  if (Array.isArray(data)) return { candidates: data, discovering: false };
  return { candidates: Array.isArray(data.candidates) ? data.candidates : [], discovering: Boolean(data.discovering) };
}

export async function fetchAllCandidates() {
  const res = await api.get("/api/candidates/all");
  return res.data;
}

export default api;
