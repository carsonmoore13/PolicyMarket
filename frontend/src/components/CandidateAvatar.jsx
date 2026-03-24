/**
 * CandidateAvatar — a polished generative avatar for candidates.
 *
 * When a real photo exists it renders a standard <img>.
 * When no photo is available it renders a unique, deterministic gradient
 * avatar seeded by the candidate's name, with clean initials typography.
 *
 * Usage:
 *   <CandidateAvatar candidate={c} size={52} partyColor="#3b82f6" />
 */

// ─── Deterministic hash ─────────────────────────────────────────────────────

function hashName(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ─── Curated palette — muted, sophisticated tones for dark UI ───────────────
// Each entry is a [from, to] gradient pair chosen to look beautiful together
const GRADIENT_PAIRS = [
  ["#2d3a4a", "#1a3a4a"], // deep steel → dark teal
  ["#3a2d4a", "#2d1a4a"], // plum → deep violet
  ["#2d4a3a", "#1a4a2d"], // forest → emerald
  ["#4a3a2d", "#4a2d1a"], // walnut → burnt sienna
  ["#2d404a", "#1a304a"], // slate blue → navy
  ["#4a2d3a", "#3a1a2d"], // merlot → dark berry
  ["#3a4a2d", "#2d4a1a"], // olive → moss
  ["#404a2d", "#4a401a"], // khaki → bronze
  ["#2d3a40", "#1a2d3a"], // charcoal teal → midnight
  ["#3a2d40", "#2d1a3a"], // grape → dark purple
  ["#2d4a40", "#1a4a3a"], // pine → jade
  ["#4a402d", "#4a3a1a"], // amber → dark gold
  ["#354050", "#253545"], // blue steel → deep slate
  ["#453545", "#352535"], // dusty rose → dark mauve
  ["#354535", "#254025"], // sage → deep green
  ["#453535", "#402525"], // terra cotta → maroon
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function CandidateAvatar({
  candidate,
  size = 52,
  partyColor = "#6b7280",
  className = "",
  onImgError,
}) {
  const name = candidate?.name || "";
  const rawPhotoUrl =
    candidate?.photo?.url && candidate?.photo?.source !== "gravatar_fallback"
      ? candidate.photo.url
      : null;
  // Bust browser cache for S3 images to prevent stale 403/404 from being cached
  const photoUrl = rawPhotoUrl
    ? `${rawPhotoUrl}${rawPhotoUrl.includes("?") ? "&" : "?"}v=4`
    : null;

  const initials =
    candidate?.photo?.fallback_initials ||
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") ||
    "?";

  const h = hashName(name);
  const pair = GRADIENT_PAIRS[h % GRADIENT_PAIRS.length];
  const angle = 120 + (h % 60); // 120°–180° range for visual variety
  const accentOpacity = 0.12 + (((h >> 4) % 10) / 100); // 0.12–0.21

  // Font size scales with avatar size
  const fontSize = Math.round(size * 0.33);
  const borderWidth = size >= 60 ? 2.5 : 2;

  return (
    <div
      className={`pm-avatar ${className}`}
      style={{
        "--avatar-size": `${size}px`,
        "--party-color": partyColor,
        "--avatar-border": `${borderWidth}px`,
      }}
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={name || "Candidate"}
          className="pm-avatar-img"
          loading="lazy"
          width={size}
          height={size}
          onError={(e) => {
            // Hide the broken image and show the initials fallback
            e.currentTarget.style.display = "none";
            e.currentTarget.nextSibling.style.display = "flex";
            onImgError?.(e);
          }}
        />
      ) : null}
      <div
        className="pm-avatar-fallback"
        style={{
          display: photoUrl ? "none" : "flex",
          background: `
            radial-gradient(circle at 30% 25%, ${partyColor}${Math.round(accentOpacity * 255).toString(16).padStart(2, "0")} 0%, transparent 55%),
            linear-gradient(${angle}deg, ${pair[0]}, ${pair[1]})
          `,
          fontSize: `${fontSize}px`,
        }}
      >
        <span className="pm-avatar-initials">{initials}</span>
        {/* Subtle geometric accent line */}
        <div
          className="pm-avatar-accent"
          style={{
            transform: `rotate(${angle - 45}deg)`,
            opacity: 0.08 + ((h >> 8) % 5) / 100,
          }}
        />
      </div>
    </div>
  );
}
