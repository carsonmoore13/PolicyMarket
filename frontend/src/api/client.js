import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:3001",
  timeout: 15000,
});

export async function lookupZip(zip) {
  const res = await api.get(`/api/zip-lookup`, { params: { zip } });
  return res.data;
}

export async function fetchCandidates(zip, level) {
  const res = await api.get(`/api/candidates`, { params: { zip, level } });
  return res.data;
}

export async function fetchAllCandidates() {
  const res = await api.get(`/api/candidates/all`);
  return res.data;
}

export default api;

