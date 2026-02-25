import app from "./app.js";
import { env, logger } from "./config/index.js";

const server = app.listen(env.port, () => {
  logger.info("Server started", { port: env.port, nodeEnv: env.nodeEnv });
});

export default server;
