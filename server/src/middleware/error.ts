import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export function notFound(_req: Request, res: Response) {
  return res.status(404).json({
    error: "NOT_FOUND",
    message: "Resource not found."
  });
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Invalid request payload.",
      details: error.flatten()
    });
  }

  console.error(error);

  return res.status(500).json({
    error: "SERVER_ERROR",
    message: "Something went wrong. Please try again."
  });
}
