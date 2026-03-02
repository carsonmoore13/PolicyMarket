import { useEffect, useState } from "react";
import { lookupZip } from "../api/client.js";

const STORAGE_KEY = "pm_zip";

export function useZipLookup() {
  const [zip, setZip] = useState("");
  const [zipData, setZipData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && /^\d{5}$/.test(saved)) {
      setZip(saved);
      submitZip(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitZip(nextZip) {
    const z = nextZip || zip;
    if (!/^\d{5}$/.test(z)) {
      setError("Please enter a valid 5-digit ZIP code");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await lookupZip(z);
      setZip(z);
      setZipData(data);
      window.localStorage.setItem(STORAGE_KEY, z);
      return data;
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        (err.response?.status === 404
          ? "Could not find location data for this ZIP"
          : "Unable to connect to PolicyMarket server");
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return { zip, setZip, zipData, loading, error, submitZip };
}

