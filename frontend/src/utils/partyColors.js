export const PARTY_COLORS = {
  Republican: "#ef4444",
  Democrat: "#3b82f6",
  Democratic: "#3b82f6",
  Independent: "#8b5cf6",
  Libertarian: "#f59e0b",
  Green: "#10b981",
  default: "#6b7280",
};

export function getPartyColor(party) {
  if (!party) return PARTY_COLORS.default;
  const lower = party.toLowerCase();
  const key = Object.keys(PARTY_COLORS).find((k) =>
    lower.includes(k.toLowerCase()),
  );
  return key ? PARTY_COLORS[key] : PARTY_COLORS.default;
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

