import { getPartyColor } from "../utils/partyColors.js";

const PARTY_LABEL = { D: "DEM", R: "REP", I: "IND" };

export default function CandidateMarker({ candidate, isSelected, onClick }) {
  const color = getPartyColor(candidate.party);
  const partyCode = (candidate.party || "").toString().trim().toUpperCase();
  const partyLabel = PARTY_LABEL[partyCode] || partyCode;

  const initials =
    candidate.photo?.fallback_initials ||
    (candidate.name || "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("");

  const hasRealPhoto =
    candidate.photo?.url && candidate.photo?.source !== "gravatar_fallback";

  const isRunoff = candidate.status_2026 === "runoff";

  const tooltip = [
    candidate.name,
    candidate.office,
    isRunoff ? "RUNOFF · May 26" : null,
  ]
    .filter(Boolean)
    .join(" — ");

  return (
    <div
      className="pm-candidate-marker group"
      data-selected={isSelected ? "true" : undefined}
      data-party={partyCode}
      style={{ "--party-color": color }}
      onClick={onClick}
      title={tooltip}
    >
      {/* Outer glow ring */}
      <div className="pm-marker-ring" />

      {/* Photo / initials circle */}
      <div className="pm-marker-face">
        {hasRealPhoto ? (
          <img
            src={candidate.photo.url}
            alt={candidate.name || "Candidate"}
            className="pm-marker-photo"
            onError={(e) => {
              e.currentTarget.style.display = "none";
              e.currentTarget.nextSibling.style.display = "flex";
            }}
          />
        ) : null}
        <span
          className="pm-marker-initials"
          style={{ display: hasRealPhoto ? "none" : "flex" }}
        >
          {initials}
        </span>
      </div>

      {/* Party label pill below the circle */}
      <div className="pm-marker-label">{partyLabel}</div>

      {/* Runoff indicator dot */}
      {isRunoff && <div className="pm-marker-runoff-dot" title="Runoff · May 26" />}

      {/* Hover tooltip */}
      <div className="pm-marker-tooltip">{tooltip}</div>
    </div>
  );
}
