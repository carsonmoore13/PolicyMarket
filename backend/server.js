import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { PORT, MONGO_URI } from "./config.js";
import { connectDB } from "./db.js";
import candidatesRouter from "./routes/candidates.js";
import zipRouter from "./routes/zip.js";
import debugRouter from "./routes/debug.js";

const app = express();

app.use(
  cors({
    origin(origin, callback) {
      // Allow localhost on any port in development
      if (!origin || /^http:\/\/localhost:\d+$/i.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"), false);
    },
  }),
);
app.use(express.json());

app.use("/api/candidates", candidatesRouter);
app.use("/api/zip-lookup", zipRouter);
app.use("/api/debug", debugRouter);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

async function start() {
  try {
    await connectDB();
    const hostMatch = MONGO_URI.match(/@([^/]+?)(?:\/|\?|$)/);
    const host = hostMatch ? hostMatch[1] : "unknown";
    app.listen(PORT, () => {
      console.log(
        `PolicyMarket backend listening on port ${PORT} (Mongo host: ${host})`,
      );
    });
  } catch (err) {
    console.error("Failed to start backend", err.message);
    process.exit(1);
  }
}

start();

