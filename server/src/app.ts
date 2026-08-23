import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "./config.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { apiRateLimit } from "./middleware/rateLimit.js";
import adminRoutes from "./routes/admin.js";
import publicRoutes from "./routes/public.js";

export const app = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (
        origin === config.clientUrl ||
        origin.endsWith(".vercel.app") ||
        origin.includes("localhost")
      ) {
        return callback(null, true);
      }

      return callback(new Error("CORS origin not allowed."));
    },
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser(config.sessionSecret));
app.use(morgan(config.nodeEnv === "development" ? "dev" : "combined"));
app.use(apiRateLimit);

app.use("/api", publicRoutes);
app.use("/api/admin", adminRoutes);
app.use(notFound);
app.use(errorHandler);
