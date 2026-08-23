import type { NextFunction, Request, Response } from "express";

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const adminUserId = req.signedCookies?.adminUserId;

  if (!adminUserId || typeof adminUserId !== "string") {
    return res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Admin authentication required."
    });
  }

  next();
}

export function requireTeamSession(req: Request, res: Response, next: NextFunction) {
  const teamId = req.signedCookies?.teamId;

  if (!teamId || typeof teamId !== "string") {
    return res.status(401).json({
      error: "SESSION_EXPIRED",
      message: "Team session not found. Re-enter the trial."
    });
  }

  next();
}
