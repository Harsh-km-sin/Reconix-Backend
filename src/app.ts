import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import { routes } from "./routes/index.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import { openApiSpec } from "./openapi/spec.js";
import { env, logger } from "./config/index.js";
import { sanitizeMiddleware } from "./middlewares/sanitize.middleware.js";
import { auditLogger } from "./middlewares/auditLogger.middleware.js";

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

// Security Middleware
app.use(helmet());
app.use(express.json({ limit: "10mb" }));
app.use(sanitizeMiddleware);
app.use(auditLogger);

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests, please try again later.",
});

if (env.nodeEnv === "production") {
  app.use("/api", limiter);
}

// Request ID & Logging Middleware
app.use((req, _res, next) => {
  const requestId = Math.random().toString(36).substring(7);
  (req as any).requestId = requestId;
  next();
});

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
