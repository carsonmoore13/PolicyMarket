import { connect, createIndexes } from "./db.js";
import { MONGODB_URI } from "./config.js";
import { runPipeline } from "./pipeline.js";
import { runScheduler } from "./scheduler.js";

const args = process.argv.slice(2);
const once = args.includes("--once");

function safeHost(uri) {
  const m = uri.match(/@([^/]+?)(?:\/|\?|$)/);
  return m ? m[1] : "unknown";
}

async function main() {
  await connect();
  await createIndexes();
  const host = safeHost(MONGODB_URI);
  console.info("PolicyMarket Elections Pipeline — MongoDB host:", host);

  if (once) {
    await runPipeline();
    process.exit(0);
  }
  runScheduler();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
