import { useEffect, useState } from "react";
import { lookupAddress } from "../api/client.js";

const STORAGE_KEY = "pm_address";

function loadSaved() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.street && parsed?.city && parsed?.state) return parsed;
  } catch {
    // ignore malformed storage
  }
  return null;
}

/**
 * Manages the voter's saved address and the resolved location/district data.
 *
 * Returns:
 *   address      — { street, city, state, zip? } — the last submitted address
 *   addressData  — server response: { address, location, districts, candidates }
 *   loading, error
 *   submitAddress(addrObj) — async, returns addressData on success
 */
export function useAddressLookup() {
  const [address, setAddress] = useState(null);
  const [addressData, setAddressData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // On mount, restore last saved address and fetch fresh data.
  useEffect(() => {
    const saved = loadSaved();
    if (saved) {
      setAddress(saved);
      submitAddress(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitAddress(addr) {
    const { street, city, state, zip } = addr || {};
    if (!street?.trim() || !city?.trim() || !state?.trim()) {
      setError("Please enter a street address, city, and state.");
      return null;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await lookupAddress({ street, city, state, zip });
      const normalized = {
        street: street.trim(),
        city: data.city || city.trim(),
        state: data.state || state.trim(),
        zip: zip || null,
      };
      setAddress(normalized);
      setAddressData(data);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      return data;
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        (err.response?.status === 404
          ? "Address not found. Please check the address and try again."
          : "Unable to connect to PolicyMarket server.");
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { address, addressData, loading, error, submitAddress };
}
