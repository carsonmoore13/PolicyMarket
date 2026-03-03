import { getPartyColor } from "../utils/partyColors.js";

export default function CandidateMarker({ candidate, isSelected, onClick }) {
  const color = getPartyColor(candidate.party);
  const initials =
    candidate.photo?.fallback_initials ||
    (candidate.name || "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("");
  const title = `${candidate.name} — ${candidate.office}${
    candidate.district ? ` ${candidate.district}` : ""
  }`;
  return (
    <div
      onClick={onClick}
      title={title}
      className={`group relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-2 text-xs font-bold text-white shadow-lg transition-transform ${
        isSelected ? "scale-110" : "hover:scale-105"
      }`}
      style={{
        borderColor: color,
        background: `${color}dd`,
      }}
    >
      {candidate.photo?.url ? (
        <img
          src={candidate.photo.url}
          alt={candidate.name || "Candidate"}
          className="h-full w-full rounded-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : null}
      {!candidate.photo?.url && <span>{initials}</span>}
      {candidate.photo?.verified && (
        <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-emerald-400 text-[8px] font-bold text-black flex items-center justify-center">
          ✓
        </div>
      )}
      <div className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 rounded bg-slate-900 px-2 py-1 text-[11px] text-gray-100 opacity-0 shadow-md transition-opacity group-hover:opacity-100">
        {title}
      </div>
    </div>
  );
}

