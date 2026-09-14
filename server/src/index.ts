import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/index.js";
import { startUsageBackgroundJobs } from "./usage/boot.js";

const env = loadConfig();
// Built here rather than inside buildApp() so the background jobs and the
// routes share one connection pool.
const db = createDb(env.DATABASE_URL);
const app = buildApp({ env, db });

// Records this build in `deploys` (when APP_VERSION is set) and purges usage
// events past the retention window, now and daily. Deliberately not inside
// buildApp(): every test builds an app, and neither a data-deleting purge nor
// a write to `deploys` belongs in that.
startUsageBackgroundJobs({ db, env, log: app.log });

app
  .listen({ port: env.PORT, host: "0.0.0.0" })
  .then((address) => {
    app.log.info(`blw-app server listening at ${address}`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
