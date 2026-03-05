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

function getPolicies(candidate) {
  if (Array.isArray(candidate.policies) && candidate.policies.length > 0) {
    return candidate.policies;
  }
  if (candidate.topics && Array.isArray(candidate.topics) && candidate.topics.length) {
    return candidate.topics;
  }
  return [];
}

export default function AppLayout({
  addressData,
  address,
  onChangeAddressClick,
  level,
  onLevelChange,
  levelCounts,
  totalCounts,
  candidates,
  candidatesLoading,
  candidatesError,
  candidatesDiscovering,
  onSelectCandidate,
  selectedCandidate,
  onLevelChangeFromMap,
}) {
  const [search, setSearch] = useState("");

  // Map center derived from geocoded address coordinates.
  const center = useMemo(() => {
    const loc = addressData?.location;
    if (loc && typeof loc.lng === "number" && typeof loc.lat === "number") {
      return [loc.lng, loc.lat];
    }
    return null;
  }, [addressData?.location?.lng, addressData?.location?.lat]);

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

  // Sidebar header: show city + state from the geocoded result.
  const locationLabel = addressData?.location?.city
    ? `${addressData.location.city}${addressData.location?.county ? `, ${addressData.location.county}` : ""}`
    : address?.city || "";

  const listHeaderLabel = locationLabel
    ? `Active campaigns • ${locationLabel}`.trim()
    : "Active campaigns";

  const levelLabel =
    level === "federal" ? "Federal" : level === "state" ? "State" : "Local";

  const federalCount = levelCounts?.federal ?? undefined;
  const stateCount = levelCounts?.state ?? undefined;
  const localCount = levelCounts?.local ?? undefined;

  const totalForCurrentLevel =
    level === "federal"
      ? totalCounts?.federal
      : level === "state"
        ? totalCounts?.state
        : totalCounts?.local;

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
          {typeof totalForCurrentLevel === "number" && totalForCurrentLevel > 0 && (
            <span className="ml-1">
              {" "}
              · Showing {filteredCandidates.length} of {totalForCurrentLevel}{" "}
              {levelLabel.toLowerCase()} candidates statewide
            </span>
          )}
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
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              {candidatesDiscovering ? (
                <>
                  <LoadingSpinner label="" />
                  <p className="text-xs text-blue-400 font-medium">
                    Fetching candidate data for your area…
                  </p>
                  <p className="text-xs text-gray-500">
                    This may take up to 30 seconds for new regions. Try switching tabs or refreshing.
                  </p>
                </>
              ) : (
                <p className="text-xs text-gray-500">No candidates to display.</p>
              )}
            </div>
          ) : (
            filteredCandidates.map((c) => {
              const initials =
                c.photo?.fallback_initials || getInitials(c.name);
              const policies = getPolicies(c);
              const active =
                selectedCandidate && selectedCandidate._id === c._id;
              const partyCode = (c.party || "").toString().trim().toUpperCase();
              let partyLabel = "";
              if (partyCode === "D") partyLabel = "Democrat";
              else if (partyCode === "R") partyLabel = "Republican";
              else if (partyCode === "I" || partyCode === "IND") partyLabel = "Independent";
              else if (partyCode === "OTH") partyLabel = "Other";
              else if (partyCode) partyLabel = partyCode;
              if (!partyLabel) partyLabel = "Unknown";
              return (
                <button
                  key={c._id || `${c.name}-${c.office}-${c.district}`}
                  type="button"
                  className={`candidate-card ${active ? "bg-active" : ""}`}
                  onClick={() => onSelectCandidate(c)}
                >
                  <div
                    className="pm-sidebar-avatar"
                    style={{ "--party-color": (c.party || "").toUpperCase() === "R" ? "#ef4444" : (c.party || "").toUpperCase() === "D" ? "#3b82f6" : "#6b7280" }}
                  >
                    {c.photo?.url && c.photo?.source !== "gravatar_fallback" ? (
                      <img
                        src={c.photo.url}
                        alt={c.name || "Candidate"}
                        className="pm-sidebar-avatar-img"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                          e.currentTarget.nextSibling.style.display = "flex";
                        }}
                      />
                    ) : null}
                    <span
                      className="pm-sidebar-avatar-initials"
                      style={{ display: (c.photo?.url && c.photo?.source !== "gravatar_fallback") ? "none" : "flex" }}
                    >
                      {initials || "?"}
                    </span>
                  </div>
                  <div className="card-content">
                    <div className="candidate-name">
                      {c.name || "Unknown candidate"}
                      {partyLabel && (
                        <span
                          className="party-badge"
                          style={{
                            borderColor: (c.party || "").toUpperCase() === "R" ? "#ef444460" : (c.party || "").toUpperCase() === "D" ? "#3b82f660" : undefined,
                            color: (c.party || "").toUpperCase() === "R" ? "#ef4444" : (c.party || "").toUpperCase() === "D" ? "#3b82f6" : undefined,
                          }}
                        >
                          {partyLabel}
                        </span>
                      )}
                    </div>
                    <div className="candidate-role">
                      {c.office || "Office"}
                      {c.district ? ` · ${c.district}` : ""}
                    </div>
                    {c.home_city && (
                      <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2 }}>
                        📍 {c.home_city}
                        {c.status_2026 === "runoff" && (
                          <span style={{ marginLeft: 6, color: "#f59e0b", fontWeight: 600 }}>
                            RUNOFF
                          </span>
                        )}
                      </div>
                    )}
                    {policies.length > 0 && (
                      <div className="policy-tags" style={{ marginTop: 6 }}>
                        {policies.map((p) => (
                          <span key={p} className="tag" title={p}>
                            {p}
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
            onClick={onChangeAddressClick}
          >
            Change Region / Register to Vote
          </button>
        </div>
      </aside>

      <main className="map-area">
        <MapView
          candidates={candidates}
          center={center}
          level={level}
          onCandidateSelect={onSelectCandidate}
          selectedCandidate={selectedCandidate}
          onLevelFromZoom={onLevelChangeFromMap}
        />
      </main>
    </div>
  );
}
