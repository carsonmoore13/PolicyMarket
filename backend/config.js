import dotenv from "dotenv";

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value || value.includes("<") || value.includes(">")) {
    throw new Error(`Missing or invalid required env var: ${name}`);
  }
  return value;
}

export const MONGO_URI = required("MONGO_URI");
export const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "elections_2026";
export const PORT = parseInt(process.env.PORT || "3001", 10);

