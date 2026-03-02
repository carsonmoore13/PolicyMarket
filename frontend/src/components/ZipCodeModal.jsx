import { useState } from "react";
import LoadingSpinner from "./LoadingSpinner.jsx";

export default function ZipCodeModal({ open, onSubmit, loading, error, initialZip }) {
  const [value, setValue] = useState(initialZip || "");
  const [confirmed, setConfirmed] = useState(null);

  if (!open) return null;

  const onChange = (e) => {
    const v = e.target.value.replace(/\D/g, "").slice(0, 5);
    setValue(v);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!/^\d{5}$/.test(value)) return;
    const data = await onSubmit(value);
    if (data) {
      setConfirmed(`${data.city}, ${data.state}`);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur">
      <div className="w-full max-w-md rounded-xl border border-gray-700 bg-slate-900/95 p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-white">
          Where are you registered to vote?
        </h2>
        <p className="mt-1 text-sm text-gray-400">
          Enter your ZIP code and we&apos;ll show candidates running in your
          districts.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <input
            value={value}
            onChange={onChange}
            inputMode="numeric"
            pattern="\d{5}"
            maxLength={5}
            className="w-full rounded-md border border-gray-700 bg-slate-800 px-3 py-2 text-lg tracking-widest text-center text-white focus:border-blue-500 focus:outline-none"
            placeholder="78705"
          />
          {error && (
            <div className="text-xs text-red-400">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading || value.length !== 5}
            className="flex w-full items-center justify-center rounded-md bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-600"
          >
            {loading ? <LoadingSpinner label="Resolving ZIP…" /> : "Show my ballot"}
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

