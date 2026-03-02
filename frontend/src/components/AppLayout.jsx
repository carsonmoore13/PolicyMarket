import { useMemo, useState } from "react";
import MapView from "./MapView.jsx";
import LoadingSpinner from "./LoadingSpinner.jsx";

function getInitials(name) {
  if (!name) return "";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function getTags(candidate) {
  if (Array.isArray(candidate.policies) && candidate.policies.length > 0) {
    return candidate.policies.slice(0, 3);
  }
  if (candidate.topics && Array.isArray(candidate.topics) && candidate.topics.length) {
    return candidate.topics.slice(0, 3);
  }
  return [];
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
  onLevelChangeFromMap,
}) {
  const [search, setSearch] = useState("");

  const center =
    zipData && typeof zipData.lng === "number" && typeof zipData.lat === "number"
      ? [zipData.lng, zipData.lat]
      : null;

  const filteredCandidates = useMemo(() => {
    const needle = search.toLowerCase().trim();
    if (!needle) return candidates;
    return candidates.filter((c) => {
      const text = `${c.name || ""} ${c.office || ""} ${c.district || ""} ${(
        c.party || ""
      ).toString()} ${(c.policies || []).join(" ")} ${(c.topics || []).join(" ")}`.toLowerCase();
      return text.includes(needle);
    });
  }, [candidates, search]);

  const listHeaderLabel = zipData
    ? `Active campaigns • ${zipData.city || ""} ${zipData.state || ""}`.trim()
    : "Active campaigns";

  const levelLabel =
    level === "federal" ? "Federal" : level === "state" ? "State" : "Local";

  const federalCount = levelCounts?.federal ?? undefined;
  const stateCount = levelCounts?.state ?? undefined;
  const localCount = levelCounts?.local ?? undefined;

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="brand-header">
          <div className="brand-logo">
            <div className="brand-icon">
              <div className="brand-icon-inner" />
            </div>
            PolicyMarket
          </div>
          <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>V.1.0</div>
        </div>

        <div className="search-area">
          <div className="input-group">
            <input
              type="text"
              className="search-input"
              placeholder="Search jurisdiction or candidate..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="context-toggles">
            <button
              type="button"
              className={`toggle-btn ${level === "federal" ? "active" : ""}`}
              onClick={() => onLevelChange("federal")}
            >
              Federal{typeof federalCount === "number" ? ` • ${federalCount}` : ""}
            </button>
            <button
              type="button"
              className={`toggle-btn ${level === "state" ? "active" : ""}`}
              onClick={() => onLevelChange("state")}
            >
              State{typeof stateCount === "number" ? ` • ${stateCount}` : ""}
            </button>
            <button
              type="button"
              className={`toggle-btn ${level === "local" ? "active" : ""}`}
              onClick={() => onLevelChange("local")}
            >
              Local{typeof localCount === "number" ? ` • ${localCount}` : ""}
            </button>
          </div>
        </div>

        <div className="list-header">
          {listHeaderLabel} • {levelLabel}
          {zip && zipData ? ` · ${zip}` : ""}
        </div>

        <div className="candidates-list">
          {candidatesLoading ? (
            <div className="flex h-full items-center justify-center">
              <LoadingSpinner label="Loading candidates…" />
            </div>
          ) : candidatesError ? (
            <div className="flex h-full items-center justify-center px-4 text-xs text-red-400">
              {candidatesError}
            </div>
          ) : filteredCandidates.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 text-xs text-gray-500">
              No candidates to display.
            </div>
          ) : (
            filteredCandidates.map((c) => {
              const initials = getInitials(c.name);
              const tags = getTags(c);
              const active = selectedCandidate && selectedCandidate._id === c._id;
              return (
                <button
                  key={c._id || `${c.name}-${c.office}-${c.district}`}
                  type="button"
                  className={`candidate-card ${active ? "bg-active" : ""}`}
                  onClick={() => onSelectCandidate(c)}
                >
                  <div className="avatar-placeholder">{initials || "IMG"}</div>
                  <div className="card-content">
                    <div className="candidate-name">
                      {c.name || "Unknown candidate"}
                      <span className="party-badge">{(c.party || "").toUpperCase()}</span>
                    </div>
                    <div className="candidate-role">
                      {c.office || "Office"}
                      {c.district ? ` · ${c.district}` : ""}
                    </div>
                    {tags.length > 0 && (
                      <div className="policy-tags">
                        {tags.map((t) => (
                          <span key={t} className="tag">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="sidebar-footer">
          <button
            type="button"
            className="primary-btn"
            onClick={onChangeZipClick}
          >
            Change Region / Register to Vote
          </button>
        </div>
      </aside>

      <main className="map-area">
        <MapView
          candidates={candidates}
          center={center}
          onCandidateSelect={onSelectCandidate}
          selectedCandidate={selectedCandidate}
          onLevelFromZoom={onLevelChangeFromMap}
        />
      </main>
    </div>
  );
}

