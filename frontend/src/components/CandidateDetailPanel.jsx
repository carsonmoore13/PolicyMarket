import { getPartyBgClass } from "../utils/partyColors.js";

export default function CandidateDetailPanel({ candidate, onClose }) {
  if (!candidate) return null;
  const partyClass = getPartyBgClass(candidate.party);
  return (
    <div className="pointer-events-none fixed inset-0 flex justify-end md:items-stretch">
      <div className="pointer-events-auto h-full w-full max-w-md translate-x-0 transform bg-slate-900/95 p-4 text-sm shadow-xl transition-transform md:translate-x-0">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {candidate.name}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-300">
              <span className={`inline-flex items-center gap-2 rounded px-2 py-0.5 text-xs ${partyClass}`}>
                {candidate.party || "Unknown party"}
              </span>
              <span className="rounded border border-gray-600 px-2 py-0.5 text-[11px] uppercase tracking-wide text-gray-200">
                {candidate.office_level}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
          >
            ✕
          </button>
        </div>
        <div className="space-y-2 text-xs text-gray-200">
          <div>
            <span className="font-semibold">Office:</span>{" "}
            {candidate.office}{" "}
            {candidate.district ? `· ${candidate.district}` : ""}
          </div>
          <div>
            <span className="font-semibold">Jurisdiction:</span>{" "}
            {candidate.jurisdiction}
          </div>
          {candidate.filing_status && (
            <div>
              <span className="font-semibold">Filing status:</span>{" "}
              {candidate.filing_status}
            </div>
          )}
          {candidate.last_verified && (
            <div>
              <span className="font-semibold">Last verified:</span>{" "}
              {new Date(candidate.last_verified).toLocaleString()}
            </div>
          )}
          {candidate.source_url && (
            <div>
              <span className="font-semibold">Source:</span>{" "}
              <a
                href={candidate.source_url}
                target="_blank"
                rel="noreferrer"
                className="text-blue-400 hover:underline"
              >
                {candidate.source_name || "Source link"}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

