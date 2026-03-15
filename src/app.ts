import express, { Application } from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { routes } from "./routes/index.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import { openApiSpec } from "./openapi/spec.js";
import { env } from "./config/index.js";

// Initialize BullMQ Workers
import "./jobs/workers/syncWorker.js";
import "./jobs/workers/jobWorker.js";

const app: Application = express();

app.use(
  cors({
    origin: env.frontendOrigin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// OpenAPI (Swagger) documentation — industry-standard, SOC2-aligned
app.get("/api-docs/spec.json", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(openApiSpec, null, 2));
});
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(openApiSpec, {
    explorer: true,
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Reconix API Docs",
  })
);

app.use("/api/v1", routes);

app.use(errorMiddleware);

export default app;
