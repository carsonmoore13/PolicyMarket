import cron from "node-cron";
import { runPipeline } from "./pipeline.js";

export function runScheduler() {
  runPipeline().catch((err) => console.error("Initial pipeline run failed", err));
  cron.schedule("0 0 * * *", () => {
    runPipeline().catch((err) => console.error("Scheduled pipeline run failed", err));
    console.info("Next scheduled run: daily at midnight");
  });
  console.info("Scheduler started (every 24h + once on start)");
}
