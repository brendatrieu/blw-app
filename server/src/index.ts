import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const env = loadConfig();
const app = buildApp({ env });

app
  .listen({ port: env.PORT, host: "0.0.0.0" })
  .then((address) => {
    app.log.info(`blw-app server listening at ${address}`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
