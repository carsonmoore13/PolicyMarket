export const PARTY_COLORS = {
  R: "#ef4444",
  D: "#3b82f6",
  NP: "#8b5cf6",
  I: "#8b5cf6",
  IND: "#8b5cf6",
  LIB: "#f59e0b",
  GRN: "#10b981",
  default: "#6b7280",
};

export function getPartyColor(party) {
  if (!party) return PARTY_COLORS.default;
  const code = party.toString().trim().toUpperCase();
  // Direct code match first (D, R, I, etc.)
  if (PARTY_COLORS[code]) return PARTY_COLORS[code];
  // Substring match for verbose strings
  if (code.startsWith("REP") || code.includes("REPUBLICAN")) return PARTY_COLORS.R;
  if (code.startsWith("DEM") || code.includes("DEMOCRAT")) return PARTY_COLORS.D;
  if (code.startsWith("IND")) return PARTY_COLORS.I;
  if (code.startsWith("LIB")) return PARTY_COLORS.LIB;
  if (code.startsWith("GRN") || code.includes("GREEN")) return PARTY_COLORS.GRN;
  return PARTY_COLORS.default;
}

export function getPartyBgClass(party) {
  if (!party) return "bg-gray-700";
  const lower = party.toLowerCase();
  if (lower.includes("rep")) return "bg-red-600";
  if (lower.includes("dem")) return "bg-blue-600";
  if (lower.includes("ind")) return "bg-violet-600";
  if (lower.includes("lib")) return "bg-amber-500";
  if (lower.includes("green")) return "bg-emerald-500";
  return "bg-gray-700";
}

