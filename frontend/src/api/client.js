import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:3001",
  timeout: 15000,
});

export async function lookupZip(zip) {
  const res = await api.get(`/api/zip-lookup`, { params: { zip } });
  return res.data;
}

export async function fetchCandidatesByZip(zip) {
  const res = await api.get(`/api/candidates`, { params: { zip } });
  return res.data;
}

export async function fetchCandidates(zip, level) {
  // Backward-compatible wrapper that uses the richer ZIP endpoint
  const payload = await fetchCandidatesByZip(zip);
  const list = Array.isArray(payload?.candidates) ? payload.candidates : [];
  const lvl = (level || "federal").toLowerCase();
  if (!["federal", "state", "local"].includes(lvl)) return list;
  return list.filter((c) => {
    const ol = (c.office_level || "").toLowerCase();
    if (lvl === "local") return ol === "city";
    if (lvl === "state") return ol === "state";
    return ol === "federal";
  });
}

export async function fetchAllCandidates() {
  const res = await api.get(`/api/candidates/all`);
  return res.data;
}

export default api;

