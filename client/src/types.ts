export type TeamStatus = "PENDING" | "ACTIVE" | "PAUSED" | "COMPLETED" | "DISQUALIFIED";
export type TaskStatus =
  | "LOCKED"
  | "AVAILABLE"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "EXPIRED";
export type AnswerType = "TEXT" | "NUMBER" | "MULTIPLE_CHOICE" | "TOWER_VERIFICATION";

export interface TeamTask {
  id: string;
  roundNumber: number;
  taskNumber: number;
  title: string;
  description: string;
  pseudocode: string | null;
  question: string;
  answerType: AnswerType;
  timeLimitSeconds: number;
  requiredTowerHeight: number | null;
  maxAttempts: number | null;
  hint: string | null;
  status: TaskStatus;
  startedAt: string | null;
  deadlineAt: string | null;
  completedAt: string | null;
  attemptCount: number;
  verifiedByAdmin: boolean;
  completionNotes: string | null;
}

export interface TeamState {
  id: string;
  teamCode: string;
  teamName: string;
  status: TeamStatus;
  currentRound: number;
  currentTask: number;
  score: number;
  rank: number;
  completedTasks: number;
  totalTasks: number;
  progressPercent: number;
  completedAt: string | null;
  lastActivityAt: string;
  config: {
    pauseOnFullscreenExit: boolean;
    pauseOnTabHidden: boolean;
    musicEnabled: boolean;
    soundsEnabled: boolean;
    musicTrackPath: string;
    eventPaused: boolean;
    submissionsLocked: boolean;
  };
  tasks: TeamTask[];
  currentTaskState: {
    taskId: string;
    taskNumber: number;
    title: string;
    status: TaskStatus;
    startedAt: string | null;
    deadlineAt: string | null;
  } | null;
}

export interface AdminDashboard {
  summary: {
    totalTeams: number;
    activeTeams: number;
    completedTeams: number;
    pausedTeams: number;
    wrongAttempts: number;
    fullscreenInterruptions: number;
  };
  config: {
    eventPaused: boolean;
    submissionsLocked: boolean;
    pauseOnFullscreenExit: boolean;
    pauseOnTabHidden: boolean;
    musicEnabled: boolean;
    soundsEnabled: boolean;
    musicTrackPath: string;
  };
  winners: Array<{
    id: string;
    teamName: string;
    completedAt: string | null;
    rank: number;
  }>;
  leaderboard: Array<{
    id: string;
    teamName: string;
    score: number;
    completedTasks: number;
    totalTasks: number;
    progressPercent: number;
    rank: number;
    status: TeamStatus;
  }>;
  teams: Array<{
    id: string;
    teamName: string;
    teamCode: string;
    currentRound: number;
    currentTask: number;
    status: TeamStatus;
    attempts: number;
    timeRemainingMs: number | null;
    lastActivityAt: string;
    completedAt: string | null;
    isTestTeam: boolean;
  }>;
  tasks: Array<{
    id: string;
    roundNumber: number;
    taskNumber: number;
    orderIndex: number;
    title: string;
    description: string;
    pseudocode?: string | null;
    question: string;
    answerType: AnswerType;
    correctAnswer: string | null;
    acceptedAnswers: unknown;
    timeLimitSeconds: number;
    requiredTowerHeight: number | null;
    maxAttempts: number | null;
    hint: string | null;
    hintAvailable: boolean;
    unlockCondition: string | null;
    isActive: boolean;
    revealAnswerOnFail: boolean;
  }>;
  events: Array<{
    id: string;
    teamName: string | null;
    eventType: string;
    timestamp: string;
    metadata: unknown;
  }>;
}
