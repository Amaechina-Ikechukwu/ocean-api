import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { corsOptions } from "./config/cors";
import { env, isProduction } from "./config/env";
import routes from "./routes";
import { errorMiddleware } from "./middleware/error.middleware";
import { requestLogger } from "./middleware/request-logger.middleware";
import { logsRouter } from "./routes/logs.routes";

export const app = express();

app.disable("x-powered-by");
app.set("trust proxy", isProduction ? 1 : false);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "same-site" }
}));
app.use(cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: "1mb", type: "application/json" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use(requestLogger);
app.use(rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false
}));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", routes);
app.use("/logs", logsRouter);
app.use(errorMiddleware);
