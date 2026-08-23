import bcrypt from "bcryptjs";
import { AnswerType, EventType, TaskStateStatus, TeamStatus } from "@prisma/client";
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
    .filter((team) => team.status === TeamStatus.COMPLETED)
    .sort((a, b) => {
      if (!a.completedAt || !b.completedAt) {
        return 0;
      }
      return a.completedAt.getTime() - b.completedAt.getTime();
    });

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
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  res.json({ teams });
});

router.get("/teams/:teamId/timeline", requireAdmin, async (req, res) => {
  const events = await prisma.eventLog.findMany({
    where: { teamId: req.params.teamId },
    orderBy: { timestamp: "asc" }
  });
  res.json({ events });
});

router.post("/teams/:teamId/reset", requireAdmin, async (req, res) => {
  const team = await prisma.team.findUnique({
    where: { id: req.params.teamId },
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
  await prisma.team.update({
    where: { id: req.params.teamId },
    data: {
      status: TeamStatus.DISQUALIFIED,
      lastActivityAt: new Date()
    }
  });

  await logEvent(EventType.TEAM_DISQUALIFIED, {
    teamId: req.params.teamId
  });

  res.json({ success: true });
});

router.post("/teams/:teamId/advance", requireAdmin, async (req, res) => {
  const state = await prisma.teamTaskState.findFirst({
    where: {
      teamId: req.params.teamId,
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

  await completeTask(req.params.teamId, state.taskId, {
    verifiedByAdmin: true,
    completionNotes: "Advanced manually by admin."
  });

  await logEvent(EventType.TEAM_ADVANCED, {
    teamId: req.params.teamId,
    metadata: {
      taskNumber: state.task.taskNumber
    }
  });

  res.json({ success: true });
});

router.post("/teams/:teamId/complete-task/:taskId", requireAdmin, async (req, res) => {
  await completeTask(req.params.teamId, req.params.taskId, {
    verifiedByAdmin: true,
    completionNotes: "Manually verified by admin/operator."
  });

  res.json({ success: true });
});

router.delete("/teams/:teamId", requireAdmin, async (req, res) => {
  const team = await prisma.team.findUnique({
    where: { id: req.params.teamId }
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
      ...payload
    }
  });

  await createInitialTaskStateForTask(task.id);

  res.status(201).json({ task });
});

router.put("/tasks/:taskId", requireAdmin, async (req, res) => {
  const payload = taskSchema.parse(req.body);

  const task = await prisma.task.update({
    where: { id: req.params.taskId },
    data: {
      ...payload
    }
  });

  res.json({ task });
});

router.delete("/tasks/:taskId", requireAdmin, async (req, res) => {
  await prisma.task.delete({
    where: { id: req.params.taskId }
  });
  res.json({ success: true });
});

router.post("/config", requireAdmin, async (req, res) => {
  const payload = configSchema.parse(req.body);
  const config = await prisma.appConfig.update({
    where: { id: "default" },
    data: payload
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

export default router;
