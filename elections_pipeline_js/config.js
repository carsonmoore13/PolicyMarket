import dotenv from "dotenv";
dotenv.config();

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
];

export const MONGODB_URI = process.env.MONGODB_URI || "";
export const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "elections_2026";
export const NOMINATIM_USER_AGENT = process.env.NOMINATIM_USER_AGENT || "policy_market_elections_app";
export const REQUESTS_TIMEOUT = parseInt(process.env.REQUESTS_TIMEOUT || "30", 10);
export const RATE_LIMIT_DELAY = parseFloat(process.env.RATE_LIMIT_DELAY || "1.5");

export function getSessionHeaders() {
  return {
    "User-Agent": USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };
}

export function getAxiosDefaults() {
  return {
    timeout: REQUESTS_TIMEOUT * 1000,
    headers: getSessionHeaders(),
  };
}
