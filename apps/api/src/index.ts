import { buildServer } from "./server.js";

const port = Number(process.env.PORT ?? 8899);
const app = buildServer();

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`api listening on :${port}`);
  })
  .catch((error: unknown) => {
    app.log.error(error);
    process.exit(1);
  });
