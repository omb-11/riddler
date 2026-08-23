import type { Response } from "express";

function baseCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    signed: true,
    path: "/"
  };
}

export function setTeamCookie(res: Response, teamId: string) {
  res.cookie("teamId", teamId, {
    ...baseCookieOptions(),
    maxAge: 1000 * 60 * 60 * 6
  });
}

export function clearTeamCookie(res: Response) {
  res.clearCookie("teamId", baseCookieOptions());
}

export function setAdminCookie(res: Response, adminUserId: string) {
  res.cookie("adminUserId", adminUserId, {
    ...baseCookieOptions(),
    maxAge: 1000 * 60 * 60 * 12
  });
}

export function clearAdminCookie(res: Response) {
  res.clearCookie("adminUserId", baseCookieOptions());
}
