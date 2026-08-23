import {
  AnswerType,
  EventType,
  Prisma,
  TaskStateStatus,
  TeamStatus,
  type AppConfig,
  type Task,
  type Team
} from "@prisma/client";
import crypto from "node:crypto";
import QRCode from "qrcode";
import { prisma } from "../lib/prisma.js";
import { logEvent } from "./events.js";

export function normalizeTeamName(teamName: string) {
  return teamName.trim().replace(/\s+/g, " ").toLowerCase();
}

export function generateTeamCode(teamName: string) {
  const slug = teamName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${slug || "CREW"}-${suffix}`;
}

export function generateSecureToken() {
  return crypto.randomBytes(18).toString("hex");
}

export function buildTeamQrPayload(team: Pick<Team, "id" | "teamCode" | "teamName">, token: string) {
  return JSON.stringify({
    version: 1,
    type: "riddler-team",
    teamId: team.id,
    teamCode: team.teamCode,
    teamName: team.teamName,
    token,
    issuedAt: new Date().toISOString()
  });
}

export async function verifyTeamQrPayload(
  teamName: string,
  payload: string
): Promise<
  | { valid: false; reason: "EMPTY_QR_PAYLOAD" | "INVALID_OR_REVOKED_QR" | "TEAM_NAME_MISMATCH" | "TEAM_ID_MISMATCH" }
  | {
      valid: true;
      reason: null;
      team: Team;
      token: string;
      joinUrl: string;
      qrDataUrl: string | null;
    }
> {
  const raw = payload.trim();

  if (!raw) {
    return { valid: false, reason: "EMPTY_QR_PAYLOAD" };
  }

  let decoded: Record<string, unknown> | null = null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      decoded = parsed as Record<string, unknown>;
    }
  } catch {
    decoded = null;
  }

  const token = decoded && typeof decoded.token === "string" ? decoded.token : raw;

  const info = await getTeamJoinInfo(token);

  if (!info) {
    return { valid: false, reason: "INVALID_OR_REVOKED_QR" };
  }

  const expectedName = normalizeTeamName(teamName);
  const decodedName = decoded && typeof decoded.teamName === "string" ? normalizeTeamName(decoded.teamName) : null;
  const actualName = normalizeTeamName(info.team.teamName);

  if (decodedName && decodedName !== expectedName) {
    return { valid: false, reason: "TEAM_NAME_MISMATCH" };
  }

  if (actualName !== expectedName) {
    return { valid: false, reason: "TEAM_NAME_MISMATCH" };
  }

  if (decoded && typeof decoded.teamId === "string" && decoded.teamId !== info.team.id) {
    return { valid: false, reason: "TEAM_ID_MISMATCH" };
  }

  return {
    valid: true,
    reason: null,
    team: info.team,
    token: info.token,
    joinUrl: info.joinUrl,
    qrDataUrl: info.qrDataUrl ?? null
  };
}

export async function getActiveTeamToken(teamId: string) {
  const token = await prisma.teamToken.findFirst({
    where: {
      teamId,
      isActive: true
    },
    orderBy: { createdAt: "desc" }
  });

  if (token) {
    return token;
  }

  return prisma.teamToken.create({
    data: {
      teamId,
      token: generateSecureToken(),
      isActive: true
    }
  });
}

export async function issueTeamToken(teamId: string, qrDataUrl?: string) {
  const existing = await prisma.teamToken.findMany({
    where: { teamId, isActive: true }
  });

  if (existing.length) {
    await prisma.teamToken.updateMany({
      where: { teamId, isActive: true },
      data: { isActive: false, revokedAt: new Date() }
    });
  }

  const token = generateSecureToken();
  return prisma.teamToken.create({
    data: {
      teamId,
      token,
      qrDataUrl,
      isActive: true
    }
  });
}

export async function getTeamJoinInfo(token: string) {
  const record = await prisma.teamToken.findUnique({
    where: { token },
    include: { team: true }
  });

  if (!record || !record.isActive || record.revokedAt) {
    return null;
  }

  return {
    token: record.token,
    team: record.team,
    qrDataUrl: record.qrDataUrl,
    joinUrl: `/join/${record.token}`
  };
}

export async function resolveTeamToken(token: string) {
  const info = await getTeamJoinInfo(token);
  if (!info) {
    return null;
  }

  return {
    teamId: info.team.id,
    teamName: info.team.teamName,
    teamCode: info.team.teamCode,
    token: info.token,
    joinUrl: info.joinUrl
  };
}

export async function makeQrDataUrl(text: string) {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 420,
    color: {
      dark: "#171a1a",
      light: "#f8f3ea"
    }
  });
}

export async function getDefaultConfig() {
  const config = await prisma.appConfig.findUnique({
    where: { id: "default" }
  });

  if (config) {
    return config;
  }

  return prisma.appConfig.create({
    data: {
      id: "default"
    }
  });
}

async function ensureTaskStates(teamId: string, tasks: Task[]) {
  for (const task of tasks) {
    await prisma.teamTaskState.upsert({
      where: {
        teamId_taskId: {
          teamId,
          taskId: task.id
        }
      },
      update: {},
      create: {
        teamId,
        taskId: task.id,
        status: task.taskNumber === 1 ? TaskStateStatus.AVAILABLE : TaskStateStatus.LOCKED
      }
    });
  }
}

export async function getOrderedActiveTasks() {
  return prisma.task.findMany({
    where: { isActive: true },
    orderBy: [{ roundNumber: "asc" }, { orderIndex: "asc" }, { taskNumber: "asc" }]
  });
}

export async function createOrRestoreTeam(teamName: string) {
  const normalizedName = normalizeTeamName(teamName);
  const tasks = await getOrderedActiveTasks();

  let team = await prisma.team.findFirst({
    where: {
      normalizedName,
      status: {
        in: [TeamStatus.PENDING, TeamStatus.ACTIVE, TeamStatus.PAUSED]
      }
    }
  });

  if (!team) {
    team = await prisma.team.create({
      data: {
        teamCode: generateTeamCode(teamName),
        teamName: teamName.trim(),
        normalizedName,
        status: TeamStatus.PENDING
      }
    });
    await logEvent(EventType.TEAM_CREATED, {
      teamId: team.id,
      metadata: { teamName: team.teamName }
    });
  } else {
    await logEvent(EventType.SESSION_RESUMED, {
      teamId: team.id,
      metadata: { teamName: team.teamName }
    });
  }

  await ensureTaskStates(team.id, tasks);

  return team;
}

export async function getTeamState(teamId: string) {
  const config = await getDefaultConfig();
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      taskStates: {
        include: {
          task: true
        },
        orderBy: {
          task: {
            orderIndex: "asc"
          }
        }
      }
    }
  });

  if (!team) {
    return null;
  }

  return shapeTeamState(team, config);
}

export function shapeTeamState(
  team: Team & {
    taskStates: Array<{
      id: string;
      status: TaskStateStatus;
      startedAt: Date | null;
      deadlineAt: Date | null;
      completedAt: Date | null;
      attemptCount: number;
      verifiedByAdmin: boolean;
      completionNotes: string | null;
      task: Task;
    }>;
  },
  config: AppConfig
) {
  const currentTaskState =
    team.taskStates.find(
      (state) =>
        state.status === TaskStateStatus.AVAILABLE || state.status === TaskStateStatus.IN_PROGRESS
    ) ??
    team.taskStates.find((state) => state.status === TaskStateStatus.COMPLETED) ??
    null;

  const completedTasks = team.taskStates.filter((state) => state.status === TaskStateStatus.COMPLETED).length;
  const totalTasks = team.taskStates.length || 1;
  const progressPercent = Math.round((completedTasks / totalTasks) * 100);
  const score = completedTasks * 125 + (team.status === TeamStatus.COMPLETED ? 400 : 0);
  const rank = team.winnerRank ?? Math.max(1, completedTasks + 1);

  return {
    id: team.id,
    teamCode: team.teamCode,
    teamName: team.teamName,
    status: team.status,
    currentRound: team.currentRound,
    currentTask: team.currentTask,
    score,
    rank,
    completedTasks,
    totalTasks,
    progressPercent,
    completedAt: team.completedAt,
    lastActivityAt: team.lastActivityAt,
    config: {
      pauseOnFullscreenExit: config.pauseOnFullscreenExit,
      pauseOnTabHidden: config.pauseOnTabHidden,
      musicEnabled: config.musicEnabled,
      soundsEnabled: config.soundsEnabled,
      musicTrackPath: config.musicTrackPath,
      eventPaused: config.eventPaused,
      submissionsLocked: config.submissionsLocked
    },
    tasks: team.taskStates.map((state) => ({
      id: state.task.id,
      roundNumber: state.task.roundNumber,
      taskNumber: state.task.taskNumber,
      title: state.task.title,
      description: state.task.description,
      pseudocode: state.task.pseudocode,
      question: state.task.question,
      answerType: state.task.answerType,
      timeLimitSeconds: state.task.timeLimitSeconds,
      requiredTowerHeight: state.task.requiredTowerHeight,
      maxAttempts: state.task.maxAttempts,
      hint: state.task.hintAvailable ? state.task.hint : null,
      status: state.status,
      startedAt: state.startedAt,
      deadlineAt: state.deadlineAt,
      completedAt: state.completedAt,
      attemptCount: state.attemptCount,
      verifiedByAdmin: state.verifiedByAdmin,
      completionNotes: state.completionNotes
    })),
    currentTaskState: currentTaskState
      ? {
          taskId: currentTaskState.task.id,
          taskNumber: currentTaskState.task.taskNumber,
          title: currentTaskState.task.title,
          status: currentTaskState.status,
          startedAt: currentTaskState.startedAt,
          deadlineAt: currentTaskState.deadlineAt
        }
      : null
  };
}

export async function beginRoundForTeam(teamId: string) {
  const tasks = await getOrderedActiveTasks();
  const firstTask = tasks[0];

  if (!firstTask) {
    throw new Error("No active tasks configured.");
  }

  await prisma.team.update({
    where: { id: teamId },
    data: {
      status: TeamStatus.ACTIVE,
      currentRound: firstTask.roundNumber,
      currentTask: firstTask.taskNumber,
      lastActivityAt: new Date()
    }
  });

  const state = await prisma.teamTaskState.findUniqueOrThrow({
    where: {
      teamId_taskId: {
        teamId,
        taskId: firstTask.id
      }
    }
  });

  if (!state.startedAt) {
    const now = new Date();
    const deadlineAt = new Date(now.getTime() + firstTask.timeLimitSeconds * 1000);

    await prisma.teamTaskState.update({
      where: { id: state.id },
      data: {
        status: TaskStateStatus.IN_PROGRESS,
        startedAt: now,
        deadlineAt
      }
    });
  }

  await logEvent(EventType.ROUND_STARTED, {
    teamId,
    metadata: { roundNumber: 1 }
  });
  await logEvent(EventType.TASK_STARTED, {
    teamId,
    metadata: { taskNumber: firstTask.taskNumber, taskTitle: firstTask.title }
  });
}

export async function expireTaskIfNeeded(teamId: string, taskId: string) {
  const taskState = await prisma.teamTaskState.findUnique({
    where: {
      teamId_taskId: {
        teamId,
        taskId
      }
    },
    include: {
      task: true
    }
  });

  if (!taskState?.deadlineAt) {
    return taskState;
  }

  if (
    taskState.status === TaskStateStatus.IN_PROGRESS &&
    taskState.deadlineAt.getTime() <= Date.now()
  ) {
    return prisma.teamTaskState.update({
      where: { id: taskState.id },
      data: {
        status: TaskStateStatus.EXPIRED
      },
      include: {
        task: true
      }
    });
  }

  return taskState;
}

export async function unlockNextTask(teamId: string, completedTaskId: string) {
  const states = await prisma.teamTaskState.findMany({
    where: { teamId },
    include: { task: true },
    orderBy: {
      task: {
        orderIndex: "asc"
      }
    }
  });

  const currentIndex = states.findIndex((state) => state.taskId === completedTaskId);
  const next = currentIndex >= 0 ? states[currentIndex + 1] : null;

  if (!next) {
    const completed = await prisma.team.update({
      where: { id: teamId },
      data: {
        status: TeamStatus.COMPLETED,
        completedAt: new Date(),
        lastActivityAt: new Date()
      }
    });

    const rank = await prisma.team.count({
      where: {
        status: TeamStatus.COMPLETED,
        id: {
          not: completed.id
        }
      }
    });

    await prisma.team.update({
      where: { id: teamId },
      data: {
        winnerRank: rank + 1
      }
    });

    await logEvent(EventType.ROUND_COMPLETED, {
      teamId,
      metadata: { rank: rank + 1 }
    });

    return null;
  }

  const now = new Date();
  const deadlineAt = new Date(now.getTime() + next.task.timeLimitSeconds * 1000);

  await prisma.teamTaskState.update({
    where: { id: next.id },
    data: {
      status: TaskStateStatus.IN_PROGRESS,
      startedAt: next.startedAt ?? now,
      deadlineAt: next.deadlineAt ?? deadlineAt
    }
  });

  await prisma.team.update({
    where: { id: teamId },
    data: {
      currentTask: next.task.taskNumber,
      currentRound: next.task.roundNumber,
      lastActivityAt: now
    }
  });

  await logEvent(EventType.TASK_STARTED, {
    teamId,
    metadata: { taskNumber: next.task.taskNumber, taskTitle: next.task.title }
  });

  return next;
}

export async function completeTask(
  teamId: string,
  taskId: string,
  options?: { verifiedByAdmin?: boolean; completionNotes?: string | null }
) {
  const updated = await prisma.teamTaskState.update({
    where: {
      teamId_taskId: {
        teamId,
        taskId
      }
    },
    data: {
      status: TaskStateStatus.COMPLETED,
      completedAt: new Date(),
      verifiedByAdmin: options?.verifiedByAdmin ?? false,
      completionNotes: options?.completionNotes ?? null
    },
    include: {
      task: true
    }
  });

  await prisma.team.update({
    where: { id: teamId },
    data: {
      lastActivityAt: new Date()
    }
  });

  await logEvent(EventType.TASK_COMPLETED, {
    teamId,
    metadata: { taskNumber: updated.task.taskNumber, taskTitle: updated.task.title }
  });

  await unlockNextTask(teamId, taskId);

  return updated;
}

export async function createInitialTaskStateForTask(taskId: string) {
  const teams = await prisma.team.findMany();
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });

  for (const team of teams) {
    await prisma.teamTaskState.upsert({
      where: {
        teamId_taskId: {
          teamId: team.id,
          taskId
        }
      },
      update: {},
      create: {
        teamId: team.id,
        taskId,
        status: task.taskNumber === 1 ? TaskStateStatus.AVAILABLE : TaskStateStatus.LOCKED
      }
    });
  }
}

export async function resetAllTeamProgress() {
  await prisma.submission.deleteMany();
  await prisma.eventLog.deleteMany({
    where: {
      teamId: {
        not: null
      }
    }
  });

  const tasks = await getOrderedActiveTasks();
  const firstTask = tasks[0];

  await prisma.team.updateMany({
    data: {
      status: TeamStatus.PENDING,
      currentRound: 1,
      currentTask: 0,
      completedAt: null,
      winnerRank: null,
      lastActivityAt: new Date()
    }
  });

  const states = await prisma.teamTaskState.findMany({
    include: { task: true }
  });

  for (const state of states) {
    await prisma.teamTaskState.update({
      where: { id: state.id },
      data: {
        status:
          firstTask && state.taskId === firstTask.id
            ? TaskStateStatus.AVAILABLE
            : TaskStateStatus.LOCKED,
        startedAt: null,
        deadlineAt: null,
        completedAt: null,
        attemptCount: 0,
        completionNotes: null,
        verifiedByAdmin: false
      }
    });
  }
}
