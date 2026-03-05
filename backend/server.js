import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { PORT, MONGO_URI } from "./config.js";
import { connectDB } from "./db.js";
import candidatesRouter from "./routes/candidates.js";
import addressRouter from "./routes/address.js";
import debugRouter from "./routes/debug.js";
import adminRouter from "./routes/admin.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(
  cors({
    origin(origin, callback) {
      // Allow localhost, localtunnel, and ngrok origins
      if (
        !origin ||
        /^http:\/\/localhost:\d+$/i.test(origin) ||
        /\.loca\.lt$/.test(origin) ||
        /\.ngrok(-free)?\.app$/.test(origin) ||
        /\.ngrok\.io$/.test(origin)
      ) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"), false);
    },
  }),
);
app.use(express.json());

app.use("/api/candidates", candidatesRouter);
app.use("/api/address-lookup", addressRouter);
app.use("/api/debug", debugRouter);
app.use("/api/admin", adminRouter);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Serve the built frontend from ../frontend/dist (production only)
const distPath = path.resolve(__dirname, "../frontend/dist");
app.use(express.static(distPath));
// SPA fallback — send index.html for any non-API route
app.get(/^(?!\/api).*$/, (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
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
