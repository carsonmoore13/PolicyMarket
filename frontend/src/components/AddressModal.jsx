import { useState } from "react";
import LoadingSpinner from "./LoadingSpinner.jsx";

const US_STATES = [
  ["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],
  ["CA","California"],["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],
  ["FL","Florida"],["GA","Georgia"],["HI","Hawaii"],["ID","Idaho"],
  ["IL","Illinois"],["IN","Indiana"],["IA","Iowa"],["KS","Kansas"],
  ["KY","Kentucky"],["LA","Louisiana"],["ME","Maine"],["MD","Maryland"],
  ["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],
  ["MO","Missouri"],["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],
  ["NH","New Hampshire"],["NJ","New Jersey"],["NM","New Mexico"],["NY","New York"],
  ["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],["OK","Oklahoma"],
  ["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],["SC","South Carolina"],
  ["SD","South Dakota"],["TN","Tennessee"],["TX","Texas"],["UT","Utah"],
  ["VT","Vermont"],["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],
  ["WI","Wisconsin"],["WY","Wyoming"],["DC","Washington DC"],
];

export default function AddressModal({ open, onSubmit, loading, error, initialAddress }) {
  const [street, setStreet] = useState(initialAddress?.street || "");
  const [city, setCity] = useState(initialAddress?.city || "");
  const [state, setState] = useState(initialAddress?.state || "TX");
  const [zip, setZip] = useState(initialAddress?.zip || "");
  const [confirmed, setConfirmed] = useState(null);

  if (!open) return null;

  const canSubmit = street.trim() && city.trim() && state;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    const data = await onSubmit({ street: street.trim(), city: city.trim(), state, zip: zip || undefined });
    if (data) {
      setConfirmed(`${data.city || city}, ${data.state || state}`);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur">
      <div className="w-full max-w-md rounded-xl border border-gray-700 bg-slate-900/95 p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-white">
          Where are you registered to vote?
        </h2>
        <p className="mt-1 text-sm text-gray-400">
          Enter your registered address and we&apos;ll find the exact candidates
          on your ballot.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          {/* Street */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Street address</label>
            <input
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              placeholder="123 Main St"
              autoComplete="street-address"
              className="w-full rounded-md border border-gray-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* City + State side by side */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">City</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Austin"
                autoComplete="address-level2"
                className="w-full rounded-md border border-gray-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="w-28">
              <label className="block text-xs text-gray-400 mb-1">State</label>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full rounded-md border border-gray-700 bg-slate-800 px-2 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                {US_STATES.map(([abbr, name]) => (
                  <option key={abbr} value={abbr}>{abbr} — {name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ZIP — optional but improves accuracy */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              ZIP code <span className="text-gray-500">(optional — improves accuracy)</span>
            </label>
            <input
              value={zip}
              onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
              inputMode="numeric"
              placeholder="78705"
              autoComplete="postal-code"
              className="w-32 rounded-md border border-gray-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {error && (
            <div className="text-xs text-red-400">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading || !canSubmit}
            className="flex w-full items-center justify-center rounded-md bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-600"
          >
            {loading ? <LoadingSpinner label="Finding your ballot…" /> : "Show my ballot"}
          </button>
        </form>

        {confirmed && (
          <div className="mt-3 text-xs text-gray-300">
            Showing results for <span className="font-semibold">{confirmed}</span>.
          </div>
        )}
      </div>
    </div>
  );
}
