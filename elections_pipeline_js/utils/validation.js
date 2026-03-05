export const INVALID_NAME_TOKENS = new Set([
  "governor",
  "commissioner",
  "comptroller",
  "senator",
  "representative",
  "secretary",
  "treasurer",
  "attorney",
  "general",
  "education",
  "railroad",
  "agriculture",
  "lieutenant",
  "land",
  "board",
  "district",
  "office",
  "candidate",
  "election",
  "primary",
  "runoff",
  "republican",
  "democrat",
  "independent",
  "party",
  "position",
  "state",
  "federal",
  "texas",
  "house",
  "senate",
  "court",
  "justice",
  "judge",
  "clerk",
  "assessor",
  "supervisor",
  "constable",
  "sheriff",
  "mayor",
  "council",
]);

export function validateCandidateName(name) {
  if (!name || typeof name !== "string") return false;
  const stripped = name.trim();
  if (!stripped) return false;

  const words = stripped.split(/\s+/);
  if (words.length < 2) return false;

  const lowerWords = new Set(
    words.map((w) => w.toLowerCase().replace(/[.,()]/g, "")),
  );

  for (const token of INVALID_NAME_TOKENS) {
    if (lowerWords.has(token)) return false;
  }

  // Must have at least one word starting with a capital letter
  const hasCapitalized = words.some((w) => {
    if (!w.length) return false;
    const ch = w[0];
    return ch === ch.toUpperCase() && ch !== ch.toLowerCase();
  });
  if (!hasCapitalized) return false;

  return true;
}

