import { useEffect, useMemo, useState } from "react";
import MapView from "./MapView.jsx";
import LoadingSpinner from "./LoadingSpinner.jsx";
import CandidateAvatar from "./CandidateAvatar.jsx";

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

/**
 * Contextual empty state for sublevel filters — explains why there are no
 * candidates rather than showing a generic "No candidates to display."
 */
function NoElectionNotice({ sublevel, sublevelLabels, userDistricts }) {
  const officeName = sublevelLabels[sublevel] || sublevel;

  // District-based races: tell the user their specific district isn't up
  const districtSublevels = {
    state_senate: userDistricts.state_senate,
    state_house: userDistricts.state_house,
    us_house: userDistricts.congressional,
  };
  const districtId = districtSublevels[sublevel];

  if (districtId) {
    return (
      <>
        <div className="no-election-icon">—</div>
        <p className="text-xs text-gray-400 font-medium">
          No 2026 election in {officeName}
        </p>
        <p className="text-xs text-gray-600" style={{ lineHeight: 1.6 }}>
          This seat is not up for election this cycle.
          Texas State Senate terms are four years, and only
          half the seats are contested each election.
        </p>
      </>
    );
  }

  // Statewide / local offices with no candidates
  const isLocal = sublevel?.startsWith("local_");
  return (
    <>
      <div className="no-election-icon">—</div>
      <p className="text-xs text-gray-400 font-medium">
        No candidates found for {officeName}
      </p>
      <p className="text-xs text-gray-600" style={{ lineHeight: 1.6 }}>
        {isLocal
          ? "There may not be a contested race for this office in your area, or candidate data has not yet been published."
          : "There may not be a contested race for this office in 2026, or candidate data has not yet been published."}
      </p>
    </>
  );
}

/**
 * Filter candidates by sublevel jurisdiction.
 */
function filterBySublevel(candidates, sublevel) {
  if (!sublevel) return candidates;

  return candidates.filter((c) => {
    const office = (c.office || "").toLowerCase();
    const dist = (c.district || "").toUpperCase();

    switch (sublevel) {
      // Federal
      case "us_senate":
        return office.includes("senate") || office.includes("u.s. senate");
      case "us_house":
        return (
          office.includes("representative") ||
          office.includes("u.s. house") ||
          office.includes("congress") ||
          dist.startsWith("TX-")
        );
      // State — district races
      case "state_senate":
        return dist.startsWith("SD-") || office.includes("state senate");
      case "state_house":
        return dist.startsWith("HD-") || office.includes("state house") || office.includes("state representative") || office.includes("tx house");
      // State — statewide offices
      case "governor":
        return office.includes("governor") && !office.includes("lieutenant");
      case "lt_governor":
        return office.includes("lieutenant governor") || office.includes("lt. governor");
      case "attorney_general":
        return office.includes("attorney general");
      case "ag_commissioner":
        return office.includes("agriculture");
      case "land_commissioner":
        return office.includes("land commissioner");
      case "statewide":
        return !dist || dist === "NONE";
      // Local categories
      case "local_county_judge":
        return office.includes("county judge") && !office.includes("court");
      case "local_commissioner":
        return office.includes("commissioner") && !office.includes("railroad") && !office.includes("agriculture") && !office.includes("land");
      case "local_jp":
        return office.includes("justice of the peace");
      case "local_clerk":
        return office.includes("clerk") || office.includes("treasurer");
      case "local_courts":
        return (office.includes("court") || office.includes("district attorney") || office.includes("judicial")) && !office.includes("county judge");
      case "local_school_board":
        return office.includes("school") || office.includes("isd") || office.includes("trustee");
      case "local_township":
        return office.includes("township") || office.includes("board of director");
      case "local_mayor":
        return office.includes("mayor");
      case "local_city_council":
        return office.includes("city council") || office.includes("council district");
      default:
        return true;
    }
  });
}

/**
 * Derive local sublevel chips dynamically from the actual candidates present.
 * Returns an array of { key, label, count } objects.
 */
function getLocalSublevels(candidates) {
  const defs = [
    { key: "local_county_judge", label: "County Judge", test: (o) => o.includes("county judge") && !o.includes("court") },
    { key: "local_commissioner", label: "Commissioners", test: (o) => o.includes("commissioner") && !o.includes("railroad") && !o.includes("agriculture") && !o.includes("land") },
    { key: "local_jp", label: "Justice of Peace", test: (o) => o.includes("justice of the peace") },
    { key: "local_clerk", label: "Clerks & Treasurer", test: (o) => o.includes("clerk") || o.includes("treasurer") },
    { key: "local_courts", label: "Courts & DA", test: (o) => (o.includes("court") || o.includes("district attorney") || o.includes("judicial")) && !o.includes("county judge") },
    { key: "local_school_board", label: "School Board", test: (o) => o.includes("school") || o.includes("isd") || o.includes("trustee") },
    { key: "local_township", label: "Township", test: (o) => o.includes("township") || o.includes("board of director") },
    { key: "local_mayor", label: "Mayor", test: (o) => o.includes("mayor") },
    { key: "local_city_council", label: "City Council", test: (o) => o.includes("city council") || o.includes("council district") },
  ];
  const result = [];
  for (const d of defs) {
    const count = candidates.filter((c) => d.test((c.office || "").toLowerCase())).length;
    if (count > 0) result.push({ ...d, count });
  }
  return result;
}

export default function AppLayout({
  addressData,
  address,
  onChangeAddressClick,
  level,
  sublevel,
  onLevelChange,
  onSublevelChange,
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
    let result = filterBySublevel(candidates, sublevel);
    const needle = search.toLowerCase().trim();
    if (needle) {
      result = result.filter((c) => {
        const text = `${c.name || ""} ${c.office || ""} ${c.district || ""} ${(
          c.party || ""
        ).toString()} ${(c.policies || []).join(" ")} ${(c.topics || []).join(" ")}`.toLowerCase();
        return text.includes(needle);
      });
    }
    return result;
  }, [candidates, search, sublevel]);

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

  const userDistricts = addressData?.districts || {};

  // Pre-compute candidate counts per sublevel for badges
  const sublevelCounts = useMemo(() => {
    const counts = {};
    const sublevels = [
      "us_senate", "us_house",
      "governor", "lt_governor", "attorney_general", "ag_commissioner", "land_commissioner",
      "state_senate", "state_house",
      "local_county_judge", "local_commissioner", "local_jp", "local_clerk",
      "local_courts", "local_school_board", "local_township", "local_mayor", "local_city_council",
    ];
    for (const sl of sublevels) {
      counts[sl] = filterBySublevel(candidates, sl).length;
    }
    return counts;
  }, [candidates]);

  // Local sublevel chips — derived dynamically from whichever local candidates are present
  const localSublevels = useMemo(
    () => (level === "local" ? getLocalSublevels(candidates) : []),
    [candidates, level],
  );

  // Auto-select first local category when entering the local tab
  useEffect(() => {
    if (level === "local" && !sublevel && localSublevels.length > 0 && candidates.length > 0) {
      onSublevelChange(localSublevels[0].key);
    }
  }, [level, sublevel, localSublevels, candidates.length]);

  // Readable sublevel label for the list header
  const sublevelLabels = {
    us_senate: "U.S. Senate",
    us_house: userDistricts.congressional ? `U.S. House · ${userDistricts.congressional}` : "U.S. House",
    state_senate: userDistricts.state_senate ? `State Senate · ${userDistricts.state_senate}` : "State Senate",
    state_house: userDistricts.state_house ? `State House · ${userDistricts.state_house}` : "State House",
    governor: "Governor",
    lt_governor: "Lieutenant Governor",
    attorney_general: "Attorney General",
    ag_commissioner: "Agriculture Commissioner",
    land_commissioner: "Land Commissioner",
    statewide: "Statewide Offices",
    // Local
    local_county_judge: "County Judge",
    local_commissioner: "County Commissioners",
    local_jp: "Justice of the Peace",
    local_clerk: "Clerks & Treasurer",
    local_courts: "Courts & District Attorney",
    local_school_board: "School Board",
    local_township: "Township Board",
    local_mayor: "Mayor",
    local_city_council: "City Council",
  };

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
            <svg className="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              className="search-input"
              placeholder="Search candidates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="search-clear"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
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
          {level === "federal" && (
            <div className="sublevel-filters">
              <button
                type="button"
                className={`sublevel-chip ${sublevel === null ? "active" : ""}`}
                onClick={() => onSublevelChange(null)}
              >
                All
              </button>
              <button
                type="button"
                className={`sublevel-chip ${sublevel === "us_senate" ? "active" : ""}`}
                onClick={() => onSublevelChange(sublevel === "us_senate" ? null : "us_senate")}
              >
                U.S. Senate
                {sublevelCounts.us_senate > 0 && <span className="sublevel-count">{sublevelCounts.us_senate}</span>}
              </button>
              <button
                type="button"
                className={`sublevel-chip ${sublevel === "us_house" ? "active" : ""}`}
                onClick={() => onSublevelChange(sublevel === "us_house" ? null : "us_house")}
              >
                U.S. House{userDistricts.congressional ? ` · ${userDistricts.congressional}` : ""}
                {sublevelCounts.us_house > 0 && <span className="sublevel-count">{sublevelCounts.us_house}</span>}
              </button>
            </div>
          )}
          {level === "state" && (
            <div className="sublevel-filters">
              <button
                type="button"
                className={`sublevel-chip ${sublevel === null ? "active" : ""}`}
                onClick={() => onSublevelChange(null)}
              >
                All
              </button>
              <button
                type="button"
                className={`sublevel-chip ${sublevel === "governor" ? "active" : ""}`}
                onClick={() => onSublevelChange(sublevel === "governor" ? null : "governor")}
              >
                Governor
                {sublevelCounts.governor > 0 && <span className="sublevel-count">{sublevelCounts.governor}</span>}
              </button>
              <button
                type="button"
                className={`sublevel-chip ${sublevel === "lt_governor" ? "active" : ""}`}
                onClick={() => onSublevelChange(sublevel === "lt_governor" ? null : "lt_governor")}
              >
                Lt. Gov
                {sublevelCounts.lt_governor > 0 && <span className="sublevel-count">{sublevelCounts.lt_governor}</span>}
              </button>
              <button
                type="button"
                className={`sublevel-chip ${sublevel === "attorney_general" ? "active" : ""}`}
                onClick={() => onSublevelChange(sublevel === "attorney_general" ? null : "attorney_general")}
              >
                AG
                {sublevelCounts.attorney_general > 0 && <span className="sublevel-count">{sublevelCounts.attorney_general}</span>}
              </button>
              <button
                type="button"
                className={`sublevel-chip ${sublevel === "ag_commissioner" ? "active" : ""}`}
                onClick={() => onSublevelChange(sublevel === "ag_commissioner" ? null : "ag_commissioner")}
              >
                Ag Comm.
                {sublevelCounts.ag_commissioner > 0 && <span className="sublevel-count">{sublevelCounts.ag_commissioner}</span>}
              </button>
              <button
                type="button"
                className={`sublevel-chip ${sublevel === "land_commissioner" ? "active" : ""}`}
                onClick={() => onSublevelChange(sublevel === "land_commissioner" ? null : "land_commissioner")}
              >
                Land Comm.
                {sublevelCounts.land_commissioner > 0 && <span className="sublevel-count">{sublevelCounts.land_commissioner}</span>}
              </button>
              <button
                type="button"
                className={`sublevel-chip ${sublevel === "state_senate" ? "active" : ""}`}
                onClick={() => onSublevelChange(sublevel === "state_senate" ? null : "state_senate")}
              >
                Senate{userDistricts.state_senate ? ` · ${userDistricts.state_senate}` : ""}
                {sublevelCounts.state_senate > 0 && <span className="sublevel-count">{sublevelCounts.state_senate}</span>}
              </button>
              <button
                type="button"
                className={`sublevel-chip ${sublevel === "state_house" ? "active" : ""}`}
                onClick={() => onSublevelChange(sublevel === "state_house" ? null : "state_house")}
              >
                House{userDistricts.state_house ? ` · ${userDistricts.state_house}` : ""}
                {sublevelCounts.state_house > 0 && <span className="sublevel-count">{sublevelCounts.state_house}</span>}
              </button>
            </div>
          )}
          {level === "local" && localSublevels.length > 0 && (
            <div className="sublevel-filters">
              {localSublevels.map((sl) => (
                <button
                  key={sl.key}
                  type="button"
                  className={`sublevel-chip ${sublevel === sl.key ? "active" : ""}`}
                  onClick={() => onSublevelChange(sublevel === sl.key ? null : sl.key)}
                >
                  {sl.label}
                  {sl.count > 0 && <span className="sublevel-count">{sl.count}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="list-header">
          {sublevel && sublevelLabels[sublevel] ? (
            <>
              <span className="jurisdiction-context">{sublevelLabels[sublevel]}</span>
              <span className="list-header-count">
                {filteredCandidates.length} candidate{filteredCandidates.length !== 1 ? "s" : ""}
              </span>
            </>
          ) : (
            <>
              {listHeaderLabel} · {levelLabel}
              {typeof totalForCurrentLevel === "number" && totalForCurrentLevel > 0 && (
                <span className="list-header-count">
                  Showing {filteredCandidates.length} of {totalForCurrentLevel}{" "}
                  {levelLabel.toLowerCase()} candidates
                </span>
              )}
            </>
          )}
        </div>

        <div className="candidates-list">
          {candidatesLoading ? (
            <div>
              {[...Array(6)].map((_, i) => (
                <div key={i} className="skeleton-card" style={{ animationDelay: `${i * 120}ms` }}>
                  <div className="skeleton-avatar" />
                  <div className="skeleton-content">
                    <div className="skeleton-line long" />
                    <div className="skeleton-line medium" />
                    <div className="skeleton-line tags" />
                  </div>
                </div>
              ))}
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
              ) : sublevel ? (
                <NoElectionNotice sublevel={sublevel} sublevelLabels={sublevelLabels} userDistricts={userDistricts} />
              ) : (
                <p className="text-xs text-gray-500">
                  {level === "local"
                    ? "No local races found for your area. We currently cover Austin, Houston, Arlington, Fort Worth, Frisco, and select county races."
                    : "No candidates to display."}
                </p>
              )}
            </div>
          ) : (
            filteredCandidates.map((c, idx) => {
              const initials =
                c.photo?.fallback_initials || getInitials(c.name);
              const policies = getPolicies(c);
              const active =
                selectedCandidate && selectedCandidate._id === c._id;
              const partyCode = (c.party || "").toString().trim().toUpperCase();
              let partyLabel = "";
              if (partyCode === "D") partyLabel = "Democrat";
              else if (partyCode === "R") partyLabel = "Republican";
              else if (partyCode === "NP") partyLabel = "Nonpartisan";
              else if (partyCode === "I" || partyCode === "IND") partyLabel = "Independent";
              else if (partyCode === "OTH") partyLabel = "Other";
              else if (partyCode) partyLabel = partyCode;
              if (!partyLabel) partyLabel = "Unknown";
              const partyColor = partyCode === "R" ? "#ef4444" : partyCode === "D" ? "#3b82f6" : partyCode === "NP" ? "#8b5cf6" : "#6b7280";
              return (
                <button
                  key={c._id || `${c.name}-${c.office}-${c.district}`}
                  type="button"
                  className={`candidate-card ${active ? "bg-active" : ""}`}
                  style={{ "--card-party-color": partyColor, "--enter-delay": `${Math.min(idx, 12) * 40}ms` }}
                  onClick={() => onSelectCandidate(c)}
                >
                  <CandidateAvatar
                    candidate={c}
                    size={52}
                    partyColor={partyColor}
                  />
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
          candidates={filteredCandidates}
          center={center}
          level={level}
          sublevel={sublevel}
          districts={addressData?.districts || null}
          onCandidateSelect={onSelectCandidate}
          selectedCandidate={selectedCandidate}
          onLevelFromZoom={onLevelChangeFromMap}
        />
      </main>
    </div>
  );
}
