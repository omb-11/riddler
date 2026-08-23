import { EventType } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export async function logEvent(
  eventType: EventType,
  options?: {
    teamId?: string | null;
    metadata?: Record<string, unknown> | null;
  }
) {
  await prisma.eventLog.create({
    data: {
      eventType,
      teamId: options?.teamId ?? null,
      metadata: options?.metadata ?? undefined
    }
  });
}
