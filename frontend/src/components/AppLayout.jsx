import LevelTabs from "./LevelTabs.jsx";
import MapView from "./MapView.jsx";
import LoadingSpinner from "./LoadingSpinner.jsx";
import { getPartyBgClass } from "../utils/partyColors.js";

function CandidateList({ candidates, activeId, onSelect }) {
  const grouped = candidates.reduce((acc, c) => {
    const key = c.party || "Other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});
  const total = candidates.length;
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-800 px-3 py-2 text-xs text-gray-300">
        {total ? `${total} candidates in your district` : "No candidates to display"}
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {Object.entries(grouped).map(([party, list]) => (
          <div key={party} className="mb-3">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-gray-400">
              {party}
            </div>
            <div className="space-y-1">
              {list.map((c) => {
                const initials = (c.name || "")
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((p) => p[0]?.toUpperCase())
                  .join("");
                const active = activeId === c._id;
                return (
                  <button
                    key={c._id || `${c.name}-${c.office}-${c.district}`}
                    type="button"
                    onClick={() => onSelect(c)}
                    className={`flex w-full items-center gap-3 rounded-md border px-2 py-2 text-left text-xs transition-colors ${
                      active
                        ? "border-blue-500 bg-slate-800"
                        : "border-gray-800 bg-slate-900/70 hover:bg-slate-800"
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold text-white ${getPartyBgClass(
                        c.party,
                      )}`}
                    >
                      {initials}
                    </div>
                    <div className="flex-1">
                      <div className="text-[13px] font-medium text-gray-100">
                        {c.name}
                      </div>
                      <div className="mt-0.5 text-[11px] text-gray-400">
                        {c.office}
                        {c.district ? ` · ${c.district}` : ""}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AppLayout({
  zipData,
  zip,
  onChangeZipClick,
  level,
  onLevelChange,
  levelCounts,
  candidates,
  candidatesLoading,
  candidatesError,
  onSelectCandidate,
  selectedCandidate,
}) {
  const center =
    zipData && typeof zipData.lng === "number" && typeof zipData.lat === "number"
      ? [zipData.lng, zipData.lat]
      : null;

  return (
    <div className="flex h-full flex-col bg-slate-950 text-gray-100">
      <header className="flex h-14 items-center justify-between border-b border-gray-800 bg-slate-900/90 px-4">
        <div className="flex items-center gap-2">
          <div className="rounded bg-blue-600 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-white">
            Policy<span className="text-blue-200">Market</span>
          </div>
          <span className="hidden text-xs text-gray-400 md:inline">
            Candidates running in your districts
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-200">
          {zipData ? (
            <span>
              {zipData.city}, {zipData.state} · {zip}
            </span>
          ) : (
            <span className="text-gray-500">No ZIP selected</span>
          )}
          <button
            type="button"
            onClick={onChangeZipClick}
            className="rounded border border-gray-700 px-2 py-1 text-[11px] text-gray-200 hover:border-blue-500 hover:text-white"
          >
            Change
          </button>
        </div>
      </header>
      <LevelTabs
        activeLevel={level}
        onLevelChange={onLevelChange}
        counts={levelCounts}
      />
      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="h-64 w-full border-b border-gray-800 bg-slate-900/80 md:h-full md:w-80 md:border-b-0 md:border-r">
          {candidatesLoading ? (
            <div className="flex h-full items-center justify-center">
              <LoadingSpinner label="Loading candidates…" />
            </div>
          ) : candidatesError ? (
            <div className="flex h-full items-center justify-center px-4 text-xs text-red-400">
              {candidatesError}
            </div>
          ) : (
            <CandidateList
              candidates={candidates}
              activeId={selectedCandidate?._id}
              onSelect={onSelectCandidate}
            />
          )}
        </aside>
        <main className="flex-1">
          <MapView
            candidates={candidates}
            center={center}
            onCandidateSelect={onSelectCandidate}
            selectedCandidate={selectedCandidate}
          />
        </main>
      </div>
    </div>
  );
}

