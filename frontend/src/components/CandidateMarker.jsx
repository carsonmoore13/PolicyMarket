import { getPartyColor } from "../utils/partyColors.js";
import CandidateAvatar from "./CandidateAvatar.jsx";

const PARTY_LABEL = { D: "DEM", R: "REP", NP: "NP", I: "IND" };

export default function CandidateMarker({ candidate, isSelected, onClick }) {
  const color = getPartyColor(candidate.party);
  const partyCode = (candidate.party || "").toString().trim().toUpperCase();
  const partyLabel = PARTY_LABEL[partyCode] || partyCode;

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
      <CandidateAvatar
        candidate={candidate}
        size={56}
        partyColor={color}
        className="pm-marker-face-avatar"
      />

      {/* Party label pill below the circle */}
      <div className="pm-marker-label">{partyLabel}</div>

      {/* Runoff indicator dot */}
      {isRunoff && <div className="pm-marker-runoff-dot" title="Runoff · May 26" />}

      {/* Hover tooltip */}
      <div className="pm-marker-tooltip">{tooltip}</div>
    </div>
  );
}
