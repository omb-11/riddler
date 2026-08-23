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
    team.taskStates.find((state) =>
      [TaskStateStatus.AVAILABLE, TaskStateStatus.IN_PROGRESS].includes(state.status)
    ) ??
    team.taskStates.find((state) => state.status === TaskStateStatus.COMPLETED) ??
    null;

  return {
    id: team.id,
    teamCode: team.teamCode,
    teamName: team.teamName,
    status: team.status,
    currentRound: team.currentRound,
    currentTask: team.currentTask,
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
