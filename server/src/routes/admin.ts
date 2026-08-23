import bcrypt from "bcryptjs";
import { AnswerType, EventType, Prisma, TaskStateStatus, TeamStatus } from "@prisma/client";
import crypto from "node:crypto";
import QRCode from "qrcode";
import { Router } from "express";
import { z } from "zod";
import { clearAdminCookie, setAdminCookie } from "../lib/cookies.js";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../middleware/auth.js";
import { logEvent } from "../services/events.js";
import {
  completeTask,
  createInitialTaskStateForTask,
  getDefaultConfig,
  resetAllTeamProgress
} from "../services/team.js";

const router = Router();

function resolveParamId(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200)
});

const taskSchema = z.object({
  roundNumber: z.number().int().min(1),
  taskNumber: z.number().int().min(1),
  orderIndex: z.number().int().min(1),
  title: z.string().trim().min(2).max(80),
  description: z.string().trim().min(2).max(600),
  pseudocode: z.string().trim().max(5000).nullable(),
  question: z.string().trim().min(2).max(500),
  answerType: z.nativeEnum(AnswerType),
  correctAnswer: z.string().trim().max(200).nullable(),
  acceptedAnswers: z.array(z.string().trim().min(1).max(200)).nullable(),
  timeLimitSeconds: z.number().int().min(10).max(3600),
  requiredTowerHeight: z.number().int().min(1).max(1000).nullable(),
  maxAttempts: z.number().int().min(1).max(100).nullable(),
  hint: z.string().trim().max(400).nullable(),
  hintAvailable: z.boolean(),
  unlockCondition: z.string().trim().max(200).nullable(),
  isActive: z.boolean(),
  revealAnswerOnFail: z.boolean()
});

const configSchema = z.object({
  eventTitle: z.string().trim().min(2).max(120).optional(),
  roundName: z.string().trim().min(2).max(80).optional(),
  eventStatus: z.string().trim().min(2).max(40).optional(),
  eventPaused: z.boolean().optional(),
  submissionsLocked: z.boolean().optional(),
  pauseOnFullscreenExit: z.boolean().optional(),
  pauseOnTabHidden: z.boolean().optional(),
  musicEnabled: z.boolean().optional(),
  soundsEnabled: z.boolean().optional(),
  musicTrackPath: z.string().trim().min(1).max(300).optional()
});

router.post("/login", async (req, res) => {
  const payload = loginSchema.parse(req.body);

  const admin = await prisma.adminUser.findUnique({
    where: { email: payload.email }
  });

  if (!admin) {
    return res.status(401).json({
      error: "INVALID_CREDENTIALS",
      message: "Incorrect email or password."
    });
  }

  const valid = await bcrypt.compare(payload.password, admin.passwordHash);

  if (!valid) {
    return res.status(401).json({
      error: "INVALID_CREDENTIALS",
      message: "Incorrect email or password."
    });
  }

  setAdminCookie(res, admin.id);
  await logEvent(EventType.ADMIN_LOGIN, {
    metadata: { adminEmail: admin.email }
  });

  res.json({
    admin: {
      id: admin.id,
      email: admin.email
    }
  });
});

router.post("/logout", requireAdmin, async (req, res) => {
  const admin = await prisma.adminUser.findUnique({
    where: { id: String(req.signedCookies.adminUserId) }
  });

  await logEvent(EventType.ADMIN_LOGOUT, {
    metadata: { adminEmail: admin?.email ?? "unknown" }
  });

  clearAdminCookie(res);
  res.json({ success: true });
});

router.get("/me", requireAdmin, async (req, res) => {
  const admin = await prisma.adminUser.findUniqueOrThrow({
    where: { id: String(req.signedCookies.adminUserId) }
  });

  res.json({
    admin: {
      id: admin.id,
      email: admin.email
    }
  });
});

router.get("/dashboard", requireAdmin, async (_req, res) => {
  const [teams, config, tasks, recentEvents] = await Promise.all([
    prisma.team.findMany({
      include: {
        taskStates: {
          include: { task: true }
        },
        submissions: true
      },
      orderBy: {
        createdAt: "asc"
      }
    }),
    getDefaultConfig(),
    prisma.task.findMany({
      orderBy: [{ roundNumber: "asc" }, { orderIndex: "asc" }]
    }),
    prisma.eventLog.findMany({
      take: 80,
      orderBy: { timestamp: "desc" },
      include: {
        team: true
      }
    })
  ]);

  const winners = teams
    .filter((team) => team.status === TeamStatus.COMPLETED && !team.isTestTeam)
    .sort((a, b) => {
      if (!a.completedAt || !b.completedAt) {
        return 0;
      }
      return a.completedAt.getTime() - b.completedAt.getTime();
    });

  const leaderboard = teams
    .map((team) => {
      const completedTasks = team.taskStates.filter((state) => state.status === TaskStateStatus.COMPLETED).length;
      const totalTasks = team.taskStates.length || 1;
      const score = completedTasks * 125 + (team.status === TeamStatus.COMPLETED ? 400 : 0);
      return {
        id: team.id,
        teamName: team.teamName,
        score,
        completedTasks,
        totalTasks,
        progressPercent: Math.round((completedTasks / totalTasks) * 100),
        rank: team.winnerRank ?? Math.max(1, completedTasks + 1),
        status: team.status
      };
    })
    .sort((a, b) => b.score - a.score || a.teamName.localeCompare(b.teamName));

  res.json({
    summary: {
      totalTeams: teams.length,
      activeTeams: teams.filter((team) => team.status === TeamStatus.ACTIVE).length,
      completedTeams: winners.length,
      pausedTeams: teams.filter((team) => team.status === TeamStatus.PAUSED).length,
      wrongAttempts: teams.reduce(
        (count, team) => count + team.submissions.filter((entry) => !entry.isCorrect).length,
        0
      ),
      fullscreenInterruptions: recentEvents.filter(
        (entry) => entry.eventType === EventType.FULLSCREEN_EXITED
      ).length
    },
    config,
    winners: winners.map((team, index) => ({
      id: team.id,
      teamName: team.teamName,
      completedAt: team.completedAt,
      rank: team.winnerRank ?? index + 1
    })),
    leaderboard: leaderboard.map((entry, index) => ({
      ...entry,
      rank: index + 1
    })),
    teams: teams.map((team) => {
      const activeState =
        team.taskStates.find((state) => state.status === TaskStateStatus.IN_PROGRESS) ??
        team.taskStates.find((state) => state.status === TaskStateStatus.AVAILABLE) ??
        null;

      return {
        id: team.id,
        teamName: team.teamName,
        teamCode: team.teamCode,
        currentRound: team.currentRound,
        currentTask: team.currentTask,
        status: team.status,
        attempts: team.submissions.length,
        timeRemainingMs:
          activeState?.deadlineAt ? Math.max(0, activeState.deadlineAt.getTime() - Date.now()) : null,
        lastActivityAt: team.lastActivityAt,
        completedAt: team.completedAt,
        isTestTeam: team.isTestTeam
      };
    }),
    tasks,
    events: recentEvents.map((event) => ({
      id: event.id,
      teamName: event.team?.teamName ?? null,
      eventType: event.eventType,
      timestamp: event.timestamp,
      metadata: event.metadata
    }))
  });
});

router.get("/teams", requireAdmin, async (req, res) => {
  const query = String(req.query.q ?? "").trim();

  const teams = await prisma.team.findMany({
    where: query
      ? {
          OR: [
            { teamName: { contains: query } },
            { teamCode: { contains: query } }
          ]
        }
      : undefined,
    include: {
      taskStates: {
        include: { task: true },
        orderBy: {
          task: {
            orderIndex: "asc"
          }
        }
      },
      submissions: {
        orderBy: {
          submittedAt: "desc"
        }
      },
      tokens: {
        orderBy: { createdAt: "desc" }
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  res.json({ teams });
});

router.post("/teams", requireAdmin, async (req, res) => {
  const teamName = z.object({
    teamName: z.string().trim().min(2).max(60)
  }).parse(req.body).teamName;

  const team = await prisma.team.create({
    data: {
      teamCode: `CREW-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      teamName,
      normalizedName: teamName.trim().toLowerCase(),
      status: TeamStatus.PENDING,
      isTestTeam: true
    }
  });

  await logEvent(EventType.TEAM_CREATED, {
    teamId: team.id,
    metadata: { teamName }
  });

  const token = await prisma.teamToken.create({
    data: {
      teamId: team.id,
      token: crypto.randomBytes(18).toString("hex"),
      isActive: true
    }
  });

  res.status(201).json({
    team,
    token,
    joinUrl: `/join/${token.token}`
  });
});

router.post("/teams/:teamId/qr", requireAdmin, async (req, res) => {
  const teamId = resolveParamId(req.params.teamId);

  if (!teamId) {
    return res.status(400).json({
      error: "INVALID_TEAM_ID",
      message: "Team identifier is missing."
    });
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId }
  });

  if (!team) {
    return res.status(404).json({
      error: "TEAM_NOT_FOUND",
      message: "Team not found."
    });
  }

  const all = await prisma.teamToken.findMany({
    where: { teamId, isActive: true }
  });

  if (all.length) {
    await prisma.teamToken.updateMany({
      where: { teamId, isActive: true },
      data: { isActive: false, revokedAt: new Date() }
    });
  }

  const token = await prisma.teamToken.create({
    data: {
      teamId,
      token: crypto.randomBytes(18).toString("hex"),
      isActive: true
    }
  });

  const baseUrl = process.env.CLIENT_URL || "http://localhost:5173";
  const joinUrl = `${baseUrl}/join/${token.token}`;
  const qrDataUrl = await QRCode.toDataURL(joinUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 420,
    color: { dark: "#171a1a", light: "#f8f3ea" }
  });

  await prisma.teamToken.update({
    where: { id: token.id },
    data: { qrDataUrl }
  });

  await logEvent(EventType.TEAM_CREATED, {
    teamId,
    metadata: { qrGenerated: true, joinUrl }
  });

  res.json({
    success: true,
    token: token.token,
    qrDataUrl,
    joinUrl,
    teamName: team.teamName,
    teamCode: team.teamCode
  });
});

router.get("/teams/:teamId/qr", requireAdmin, async (req, res) => {
  const teamId = resolveParamId(req.params.teamId);

  if (!teamId) {
    return res.status(400).json({
      error: "INVALID_TEAM_ID",
      message: "Team identifier is missing."
    });
  }

  const token = await prisma.teamToken.findFirst({
    where: { teamId, isActive: true },
    orderBy: { createdAt: "desc" }
  });

  if (!token) {
    return res.status(404).json({
      error: "QR_NOT_FOUND",
      message: "No active QR is available for this team."
    });
  }

  const baseUrl = process.env.CLIENT_URL || "http://localhost:5173";
  res.json({
    token: token.token,
    qrDataUrl: token.qrDataUrl ?? null,
    joinUrl: `${baseUrl}/join/${token.token}`,
    teamId
  });
});

router.get("/teams/:teamId/timeline", requireAdmin, async (req, res) => {
  const teamId = resolveParamId(req.params.teamId);

  if (!teamId) {
    return res.status(400).json({
      error: "INVALID_TEAM_ID",
      message: "Team identifier is missing."
    });
  }

  const events = await prisma.eventLog.findMany({
    where: { teamId },
    orderBy: { timestamp: "asc" }
  });
  res.json({ events });
});

router.post("/teams/:teamId/reset", requireAdmin, async (req, res) => {
  const teamId = resolveParamId(req.params.teamId);

  if (!teamId) {
    return res.status(400).json({
      error: "INVALID_TEAM_ID",
      message: "Team identifier is missing."
    });
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      taskStates: {
        include: { task: true }
      }
    }
  });

  if (!team) {
    return res.status(404).json({
      error: "TEAM_NOT_FOUND",
      message: "Team not found."
    });
  }

  await prisma.submission.deleteMany({
    where: { teamId: team.id }
  });

  for (const state of team.taskStates) {
    await prisma.teamTaskState.update({
      where: { id: state.id },
      data: {
        status: state.task.taskNumber === 1 ? TaskStateStatus.AVAILABLE : TaskStateStatus.LOCKED,
        startedAt: null,
        deadlineAt: null,
        completedAt: null,
        attemptCount: 0,
        completionNotes: null,
        verifiedByAdmin: false
      }
    });
  }

  await prisma.team.update({
    where: { id: team.id },
    data: {
      status: TeamStatus.PENDING,
      currentRound: 1,
      currentTask: 0,
      completedAt: null,
      winnerRank: null,
      lastActivityAt: new Date()
    }
  });

  await logEvent(EventType.TEAM_RESET, {
    teamId: team.id,
    metadata: { source: "admin" }
  });

  res.json({ success: true });
});

router.post("/teams/:teamId/disqualify", requireAdmin, async (req, res) => {
  const teamId = resolveParamId(req.params.teamId);

  if (!teamId) {
    return res.status(400).json({
      error: "INVALID_TEAM_ID",
      message: "Team identifier is missing."
    });
  }

  await prisma.team.update({
    where: { id: teamId },
    data: {
      status: TeamStatus.DISQUALIFIED,
      lastActivityAt: new Date()
    }
  });

  await logEvent(EventType.TEAM_DISQUALIFIED, {
    teamId
  });

  res.json({ success: true });
});

router.post("/teams/:teamId/advance", requireAdmin, async (req, res) => {
  const teamId = resolveParamId(req.params.teamId);

  if (!teamId) {
    return res.status(400).json({
      error: "INVALID_TEAM_ID",
      message: "Team identifier is missing."
    });
  }

  const state = await prisma.teamTaskState.findFirst({
    where: {
      teamId,
      status: {
        in: [TaskStateStatus.AVAILABLE, TaskStateStatus.IN_PROGRESS]
      }
    },
    include: {
      task: true
    },
    orderBy: {
      task: {
        orderIndex: "asc"
      }
    }
  });

  if (!state) {
    return res.status(404).json({
      error: "ACTIVE_TASK_NOT_FOUND",
      message: "No current task to advance."
    });
  }

  await completeTask(teamId, state.taskId, {
    verifiedByAdmin: true,
    completionNotes: "Advanced manually by admin."
  });

  await logEvent(EventType.TEAM_ADVANCED, {
    teamId,
    metadata: {
      taskNumber: state.task.taskNumber
    }
  });

  res.json({ success: true });
});

router.post("/teams/:teamId/complete-task/:taskId", requireAdmin, async (req, res) => {
  const teamId = resolveParamId(req.params.teamId);
  const taskId = resolveParamId(req.params.taskId);

  if (!teamId || !taskId) {
    return res.status(400).json({
      error: "INVALID_TEAM_OR_TASK_ID",
      message: "Team or task identifier is missing."
    });
  }

  await completeTask(teamId, taskId, {
    verifiedByAdmin: true,
    completionNotes: "Manually verified by admin/operator."
  });

  res.json({ success: true });
});

router.delete("/teams/:teamId", requireAdmin, async (req, res) => {
  const teamId = resolveParamId(req.params.teamId);

  if (!teamId) {
    return res.status(400).json({
      error: "INVALID_TEAM_ID",
      message: "Team identifier is missing."
    });
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId }
  });

  if (!team) {
    return res.status(404).json({
      error: "TEAM_NOT_FOUND",
      message: "Team not found."
    });
  }

  if (!team.isTestTeam) {
    return res.status(400).json({
      error: "TEAM_NOT_DELETABLE",
      message: "Only test teams can be deleted from the dashboard."
    });
  }

  await prisma.team.delete({
    where: { id: team.id }
  });

  res.json({ success: true });
});

router.post("/tasks", requireAdmin, async (req, res) => {
  const payload = taskSchema.parse(req.body);

  const task = await prisma.task.create({
    data: {
      ...payload,
      acceptedAnswers: payload.acceptedAnswers ?? Prisma.JsonNull
    }
  });

  await createInitialTaskStateForTask(task.id);

  res.status(201).json({ task });
});

router.put("/tasks/:taskId", requireAdmin, async (req, res) => {
  const payload = taskSchema.parse(req.body);

  const taskId = resolveParamId(req.params.taskId);

  if (!taskId) {
    return res.status(400).json({
      error: "INVALID_TASK_ID",
      message: "Task identifier is missing."
    });
  }

  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      ...payload,
      acceptedAnswers: payload.acceptedAnswers ?? Prisma.JsonNull
    }
  });

  res.json({ task });
});

router.delete("/tasks/:taskId", requireAdmin, async (req, res) => {
  const taskId = resolveParamId(req.params.taskId);

  if (!taskId) {
    return res.status(400).json({
      error: "INVALID_TASK_ID",
      message: "Task identifier is missing."
    });
  }

  await prisma.task.delete({
    where: { id: taskId }
  });
  res.json({ success: true });
});

router.post("/config", requireAdmin, async (req, res) => {
  const payload = configSchema.parse(req.body);
  const config = await prisma.appConfig.upsert({
    where: { id: "default" },
    update: payload,
    create: {
      id: "default",
      eventTitle: payload.eventTitle ?? "The Pirate Trials",
      roundName: payload.roundName ?? "Round 1",
      eventStatus: payload.eventStatus ?? "READY",
      eventPaused: payload.eventPaused ?? false,
      submissionsLocked: payload.submissionsLocked ?? false,
      pauseOnFullscreenExit: payload.pauseOnFullscreenExit ?? true,
      pauseOnTabHidden: payload.pauseOnTabHidden ?? false,
      musicEnabled: payload.musicEnabled ?? true,
      soundsEnabled: payload.soundsEnabled ?? true,
      musicTrackPath: payload.musicTrackPath ?? "/audio/odyssey-theme.mp3"
    }
  });

  if (payload.eventPaused === true) {
    await logEvent(EventType.EVENT_PAUSED);
  }

  if (payload.eventPaused === false) {
    await logEvent(EventType.EVENT_RESUMED);
  }

  if (payload.submissionsLocked === true) {
    await logEvent(EventType.SUBMISSIONS_LOCKED);
  }

  if (payload.submissionsLocked === false) {
    await logEvent(EventType.SUBMISSIONS_UNLOCKED);
  }

  res.json({ config });
});

router.post("/event/reset", requireAdmin, async (_req, res) => {
  await resetAllTeamProgress();
  res.json({ success: true });
});

router.post("/dev/simulate", requireAdmin, async (req, res) => {
  const appEnv = (process.env.APP_ENV ?? process.env.NODE_ENV ?? "development").toLowerCase();

  if (appEnv === "production") {
    return res.status(403).json({
      error: "DEV_ONLY",
      message: "Development simulation is disabled in production."
    });
  }

  const scenarioSchema = z.object({
    scenario: z.enum([
      "new",
      "task1-active",
      "task1-complete",
      "task2-active",
      "task2-complete",
      "winner",
      "disqualified"
    ]),
    teamName: z.string().trim().min(2).max(40).optional()
  });

  const payload = scenarioSchema.parse(req.body);
  const scenario = payload.scenario;

  const candidate = payload.teamName
    ? await prisma.team.findFirst({
        where: { normalizedName: payload.teamName.trim().toLowerCase() }
      })
    : await prisma.team.findFirst({
        where: { isTestTeam: true },
        orderBy: { createdAt: "asc" }
      });

  if (!candidate) {
    const created = await prisma.team.create({
      data: {
        teamCode: `DEV-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        teamName: payload.teamName ?? "DEV CREW",
        normalizedName: (payload.teamName ?? "DEV CREW").trim().toLowerCase(),
        status: TeamStatus.PENDING,
        isTestTeam: true
      }
    });

    const taskOne = await prisma.task.findFirst({ where: { taskNumber: 1, roundNumber: 1 } });
    if (taskOne) {
      await prisma.teamTaskState.upsert({
        where: { teamId_taskId: { teamId: created.id, taskId: taskOne.id } },
        create: { teamId: created.id, taskId: taskOne.id, status: TaskStateStatus.AVAILABLE },
        update: { status: TaskStateStatus.AVAILABLE }
      });
    }

    return res.json({ success: true, team: created });
  }

  const taskOne = await prisma.task.findFirst({ where: { taskNumber: 1, roundNumber: 1 } });
  const taskTwo = await prisma.task.findFirst({ where: { taskNumber: 2, roundNumber: 1 } });

  if (scenario === "new") {
    const created = await prisma.team.create({
      data: {
        teamCode: `DEV-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        teamName: payload.teamName ?? `DEV CREW ${Date.now()}`,
        normalizedName: (payload.teamName ?? `DEV CREW ${Date.now()}`).trim().toLowerCase(),
        status: TeamStatus.PENDING,
        isTestTeam: true
      }
    });
    if (taskOne) {
      await prisma.teamTaskState.upsert({
        where: { teamId_taskId: { teamId: created.id, taskId: taskOne.id } },
        create: { teamId: created.id, taskId: taskOne.id, status: TaskStateStatus.AVAILABLE },
        update: { status: TaskStateStatus.AVAILABLE }
      });
    }
    return res.json({ success: true, team: created });
  }

  if (taskOne && taskTwo) {
    const firstState = await prisma.teamTaskState.findUnique({ where: { teamId_taskId: { teamId: candidate.id, taskId: taskOne.id } } });
    const secondState = await prisma.teamTaskState.findUnique({ where: { teamId_taskId: { teamId: candidate.id, taskId: taskTwo.id } } });

    if (scenario === "task1-active") {
      await prisma.teamTaskState.upsert({
        where: { teamId_taskId: { teamId: candidate.id, taskId: taskOne.id } },
        create: { teamId: candidate.id, taskId: taskOne.id, status: TaskStateStatus.AVAILABLE, startedAt: new Date(), deadlineAt: new Date(Date.now() + 60_000) },
        update: { status: TaskStateStatus.AVAILABLE, startedAt: new Date(), deadlineAt: new Date(Date.now() + 60_000) }
      });
    }

    if (scenario === "task1-complete") {
      await prisma.teamTaskState.upsert({
        where: { teamId_taskId: { teamId: candidate.id, taskId: taskOne.id } },
        create: { teamId: candidate.id, taskId: taskOne.id, status: TaskStateStatus.COMPLETED, completedAt: new Date() },
        update: { status: TaskStateStatus.COMPLETED, completedAt: new Date() }
      });
      if (secondState) {
        await prisma.teamTaskState.upsert({
          where: { teamId_taskId: { teamId: candidate.id, taskId: taskTwo.id } },
          create: { teamId: candidate.id, taskId: taskTwo.id, status: TaskStateStatus.AVAILABLE },
          update: { status: TaskStateStatus.AVAILABLE, startedAt: null, deadlineAt: null }
        });
      }
    }

    if (scenario === "task2-active") {
      await prisma.teamTaskState.upsert({
        where: { teamId_taskId: { teamId: candidate.id, taskId: taskOne.id } },
        create: { teamId: candidate.id, taskId: taskOne.id, status: TaskStateStatus.COMPLETED, completedAt: new Date() },
        update: { status: TaskStateStatus.COMPLETED, completedAt: new Date() }
      });
      await prisma.teamTaskState.upsert({
        where: { teamId_taskId: { teamId: candidate.id, taskId: taskTwo.id } },
        create: { teamId: candidate.id, taskId: taskTwo.id, status: TaskStateStatus.AVAILABLE, startedAt: new Date(), deadlineAt: new Date(Date.now() + 120_000) },
        update: { status: TaskStateStatus.AVAILABLE, startedAt: new Date(), deadlineAt: new Date(Date.now() + 120_000) }
      });
    }

    if (scenario === "task2-complete") {
      await prisma.teamTaskState.upsert({
        where: { teamId_taskId: { teamId: candidate.id, taskId: taskOne.id } },
        create: { teamId: candidate.id, taskId: taskOne.id, status: TaskStateStatus.COMPLETED, completedAt: new Date() },
        update: { status: TaskStateStatus.COMPLETED, completedAt: new Date() }
      });
      await prisma.teamTaskState.upsert({
        where: { teamId_taskId: { teamId: candidate.id, taskId: taskTwo.id } },
        create: { teamId: candidate.id, taskId: taskTwo.id, status: TaskStateStatus.COMPLETED, completedAt: new Date() },
        update: { status: TaskStateStatus.COMPLETED, completedAt: new Date() }
      });
    }

    if (scenario === "winner") {
      await prisma.team.update({
        where: { id: candidate.id },
        data: {
          status: TeamStatus.COMPLETED,
          completedAt: new Date(),
          winnerRank: 1,
          currentRound: 1,
          currentTask: 2,
          lastActivityAt: new Date()
        }
      });
      await prisma.teamTaskState.upsert({
        where: { teamId_taskId: { teamId: candidate.id, taskId: taskTwo.id } },
        create: { teamId: candidate.id, taskId: taskTwo.id, status: TaskStateStatus.COMPLETED, completedAt: new Date() },
        update: { status: TaskStateStatus.COMPLETED, completedAt: new Date() }
      });
    }

    if (scenario === "disqualified") {
      await prisma.team.update({
        where: { id: candidate.id },
        data: { status: TeamStatus.DISQUALIFIED, lastActivityAt: new Date() }
      });
    }
  }

  res.json({ success: true, team: candidate });
});

export default router;
