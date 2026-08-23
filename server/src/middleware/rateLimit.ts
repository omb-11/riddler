import rateLimit from "express-rate-limit";
import { config } from "../config.js";

export const apiRateLimit = rateLimit({
  windowMs: config.rateLimitWindowMs,
  limit: config.rateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "RATE_LIMITED",
    message: "Too many requests. Slow down and try again."
  }
});
