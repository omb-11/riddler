import { AnswerType, EventType, TaskStateStatus, TeamStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { clearTeamCookie, setTeamCookie } from "../lib/cookies.js";
import { prisma } from "../lib/prisma.js";
import { requireTeamSession } from "../middleware/auth.js";
import { evaluateAnswer } from "../services/evaluator.js";
import { logEvent } from "../services/events.js";
import {
  beginRoundForTeam,
  completeTask,
  createOrRestoreTeam,
  expireTaskIfNeeded,
  getDefaultConfig,
  getTeamState
} from "../services/team.js";

const router = Router();

const createTeamSchema = z.object({
  teamName: z.string().trim().min(2).max(40)
});

const submitAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(200)
});

const eventSchema = z.object({
  eventType: z.enum(["FULLSCREEN_ENTERED", "FULLSCREEN_EXITED", "TAB_HIDDEN", "TAB_VISIBLE"]),
  metadata: z.record(z.string(), z.unknown()).optional()
});

router.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1 as ok`;
    res.json({
      ok: true,
      appEnv: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
      database: "healthy",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      appEnv: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
      database: "unhealthy",
      timestamp: new Date().toISOString(),
      error: "DATABASE_UNAVAILABLE"
    });
  }
});

router.post("/teams/session", async (req, res) => {
  const payload = createTeamSchema.parse(req.body);
  const team = await createOrRestoreTeam(payload.teamName);
  setTeamCookie(res, team.id);
  const state = await getTeamState(team.id);

  res.status(201).json({
    team: state
  });
});

router.get("/session", async (req, res) => {
  const teamId = req.signedCookies?.teamId;

  if (!teamId || typeof teamId !== "string") {
    return res.status(200).json({
      team: null
    });
  }

  const state = await getTeamState(teamId);

  if (!state) {
    clearTeamCookie(res);
  }

  res.json({
    team: state ?? null
  });
});

router.post("/trial/begin", requireTeamSession, async (req, res) => {
  const config = await getDefaultConfig();

  if (config.eventPaused) {
    return res.status(423).json({
      error: "EVENT_PAUSED",
      message: "The event is currently paused by the coordinator."
    });
  }

  const teamId = String(req.signedCookies.teamId);
  await beginRoundForTeam(teamId);
  const state = await getTeamState(teamId);

  res.json({
    team: state
  });
});

router.post("/events", requireTeamSession, async (req, res) => {
  const payload = eventSchema.parse(req.body);
  await logEvent(payload.eventType as EventType, {
    teamId: String(req.signedCookies.teamId),
    metadata: payload.metadata
  });

  const config = await getDefaultConfig();

  if (
    (payload.eventType === "FULLSCREEN_EXITED" && config.pauseOnFullscreenExit) ||
    (payload.eventType === "TAB_HIDDEN" && config.pauseOnTabHidden)
  ) {
    await prisma.team.update({
      where: { id: String(req.signedCookies.teamId) },
      data: {
        status: TeamStatus.PAUSED,
        lastActivityAt: new Date()
      }
    });
  }

  if (payload.eventType === "FULLSCREEN_ENTERED" || payload.eventType === "TAB_VISIBLE") {
    await prisma.team.update({
      where: { id: String(req.signedCookies.teamId) },
      data: {
        status: TeamStatus.ACTIVE,
        lastActivityAt: new Date()
      }
    });
  }

  const state = await getTeamState(String(req.signedCookies.teamId));
  res.json({ team: state });
});

function resolveParamId(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

router.post("/tasks/:taskId/submit", requireTeamSession, async (req, res) => {
  const payload = submitAnswerSchema.parse(req.body);
  const config = await getDefaultConfig();
  const taskId = resolveParamId(req.params.taskId);

  if (!taskId) {
    return res.status(400).json({
      error: "INVALID_TASK_ID",
      message: "Task identifier is missing."
    });
  }

  if (config.eventPaused) {
    return res.status(423).json({
      error: "EVENT_PAUSED",
      message: "The event is currently paused."
    });
  }

  if (config.submissionsLocked) {
    return res.status(423).json({
      error: "SUBMISSIONS_LOCKED",
      message: "Submissions are currently locked."
    });
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId }
  });

  if (!task || !task.isActive) {
    return res.status(404).json({
      error: "TASK_NOT_FOUND",
      message: "Task not found."
    });
  }

  if (task.answerType === AnswerType.TOWER_VERIFICATION) {
    return res.status(400).json({
      error: "MANUAL_VERIFICATION_REQUIRED",
      message: "This task requires manual operator verification."
    });
  }

  const teamId = String(req.signedCookies.teamId);
  const taskState = await expireTaskIfNeeded(teamId, task.id);

  if (!taskState) {
    return res.status(404).json({
      error: "TASK_STATE_NOT_FOUND",
      message: "Task state not found."
    });
  }

  if (taskState.status === TaskStateStatus.EXPIRED) {
    return res.status(410).json({
      error: "TASK_EXPIRED",
      message: "Time is up for this task."
    });
  }

  if (
    taskState.status !== TaskStateStatus.IN_PROGRESS &&
    taskState.status !== TaskStateStatus.AVAILABLE
  ) {
    return res.status(409).json({
      error: "TASK_LOCKED",
      message: "This task is not currently available."
    });
  }

  if (taskState.status === TaskStateStatus.AVAILABLE) {
    const now = new Date();
    await prisma.teamTaskState.update({
      where: { id: taskState.id },
      data: {
        status: TaskStateStatus.IN_PROGRESS,
        startedAt: now,
        deadlineAt: new Date(now.getTime() + task.timeLimitSeconds * 1000)
      }
    });
    await logEvent(EventType.TASK_STARTED, {
      teamId,
      metadata: { taskNumber: task.taskNumber, taskTitle: task.title }
    });
  }

  if (task.maxAttempts && taskState.attemptCount >= task.maxAttempts) {
    return res.status(429).json({
      error: "MAX_ATTEMPTS_REACHED",
      message: "Maximum attempts reached for this task."
    });
  }

  const { normalizedAnswer, isCorrect } = evaluateAnswer(task, payload.answer);
  const nextAttempt = taskState.attemptCount + 1;

  await prisma.$transaction(async (tx) => {
    await tx.submission.create({
      data: {
        teamId,
        taskId: task.id,
        submittedAnswer: payload.answer,
        normalizedAnswer,
        isCorrect,
        attemptNumber: nextAttempt
      }
    });

    await tx.teamTaskState.update({
      where: { id: taskState.id },
      data: {
        attemptCount: nextAttempt
      }
    });

    await tx.team.update({
      where: { id: teamId },
      data: {
        lastActivityAt: new Date()
      }
    });
  });

  await logEvent(EventType.ANSWER_SUBMITTED, {
    teamId,
    metadata: { taskNumber: task.taskNumber, answerLength: payload.answer.length }
  });

  if (isCorrect) {
    await logEvent(EventType.ANSWER_CORRECT, {
      teamId,
      metadata: { taskNumber: task.taskNumber }
    });
    await completeTask(teamId, task.id);
  } else {
    await logEvent(EventType.ANSWER_WRONG, {
      teamId,
      metadata: { taskNumber: task.taskNumber }
    });
  }

  const state = await getTeamState(teamId);
  const refreshedTaskState = state?.tasks.find((entry) => entry.id === task.id);

  res.json({
    correct: isCorrect,
    revealAnswer: !isCorrect && task.revealAnswerOnFail ? task.correctAnswer : null,
    team: state,
    taskState: refreshedTaskState
  });
});

router.post("/tasks/:taskId/tower-submit", requireTeamSession, async (req, res) => {
  const taskId = resolveParamId(req.params.taskId);

  if (!taskId) {
    return res.status(400).json({
      error: "INVALID_TASK_ID",
      message: "Task identifier is missing."
    });
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId }
  });

  if (!task || task.answerType !== AnswerType.TOWER_VERIFICATION) {
    return res.status(404).json({
      error: "TASK_NOT_FOUND",
      message: "Tower verification task not found."
    });
  }

  const teamId = String(req.signedCookies.teamId);
  const taskState = await expireTaskIfNeeded(teamId, task.id);

  if (!taskState) {
    return res.status(404).json({
      error: "TASK_STATE_NOT_FOUND",
      message: "Task state not found."
    });
  }

  if (taskState.status === TaskStateStatus.EXPIRED) {
    return res.status(410).json({
      error: "TASK_EXPIRED",
      message: "Time is up for this task."
    });
  }

  await prisma.team.update({
    where: { id: teamId },
    data: {
      lastActivityAt: new Date()
    }
  });

  await logEvent(EventType.ANSWER_SUBMITTED, {
    teamId,
    metadata: {
      taskNumber: task.taskNumber,
      mode: "tower-verification-request"
    }
  });

  res.json({
    success: true,
    message: "Challenge submitted for operator verification."
  });
});

router.post("/trial/resume", requireTeamSession, async (req, res) => {
  await prisma.team.update({
    where: { id: String(req.signedCookies.teamId) },
    data: {
      status: TeamStatus.ACTIVE,
      lastActivityAt: new Date()
    }
  });
  await logEvent(EventType.SESSION_RESUMED, {
    teamId: String(req.signedCookies.teamId),
    metadata: { source: "resume-endpoint" }
  });

  const state = await getTeamState(String(req.signedCookies.teamId));
  res.json({ team: state });
});

export default router;
