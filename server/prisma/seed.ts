import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { PrismaClient, AnswerType, TaskStateStatus } from "@prisma/client";

dotenv.config({
  path: fileURLToPath(new URL("../../.env", import.meta.url))
});

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set before seeding.");
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: { passwordHash },
    create: { email: adminEmail, passwordHash }
  });

  await prisma.appConfig.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      pauseOnFullscreenExit: process.env.PAUSE_ON_FULLSCREEN_EXIT !== "false",
      pauseOnTabHidden: process.env.PAUSE_ON_TAB_HIDDEN === "true",
      musicEnabled: process.env.MUSIC_ENABLED !== "false",
      soundsEnabled: process.env.SOUNDS_ENABLED !== "false",
      musicTrackPath: process.env.MUSIC_TRACK_PATH || "/audio/odyssey-theme.mp3"
    }
  });

  const taskOne = await prisma.task.upsert({
    where: {
      roundNumber_taskNumber: {
        roundNumber: 1,
        taskNumber: 1
      }
    },
    update: {
      title: "Mystery Box",
      description:
        "Demo-editable challenge for Round 1. Teams identify the required object group and solve the riddle beneath the physical task.",
      pseudocode: `START\n\nSET treasure = 0\n\nFOR i = 1 TO 3\n    READ clue\n    IF clue is correct\n        treasure = treasure + 10\n    END IF\nEND FOR\n\nDISPLAY treasure\n\nEND`,
      question: "What is the output if all 3 clues are correct?",
      answerType: AnswerType.NUMBER,
      correctAnswer: "30",
      acceptedAnswers: ["30", "30.0"],
      timeLimitSeconds: 60,
      maxAttempts: 5,
      hint: "Each correct clue adds the same amount.",
      hintAvailable: true,
      isActive: true,
      revealAnswerOnFail: false,
      orderIndex: 1
    },
    create: {
      roundNumber: 1,
      taskNumber: 1,
      orderIndex: 1,
      title: "Mystery Box",
      description:
        "Demo-editable challenge for Round 1. Teams identify the required object group and solve the riddle beneath the physical task.",
      pseudocode: `START\n\nSET treasure = 0\n\nFOR i = 1 TO 3\n    READ clue\n    IF clue is correct\n        treasure = treasure + 10\n    END IF\nEND FOR\n\nDISPLAY treasure\n\nEND`,
      question: "What is the output if all 3 clues are correct?",
      answerType: AnswerType.NUMBER,
      correctAnswer: "30",
      acceptedAnswers: ["30", "30.0"],
      timeLimitSeconds: 60,
      maxAttempts: 5,
      hint: "Each correct clue adds the same amount.",
      hintAvailable: true,
      isActive: true,
      revealAnswerOnFail: false
    }
  });

  await prisma.task.upsert({
    where: {
      roundNumber_taskNumber: {
        roundNumber: 1,
        taskNumber: 2
      }
    },
    update: {
      title: "Pirate Tower",
      description:
        "Demo-editable physical verification task. Build the tallest tower within the time limit. Admin/operator confirms completion.",
      pseudocode: null,
      question: "Submit your tower for operator verification once the required height is reached.",
      answerType: AnswerType.TOWER_VERIFICATION,
      correctAnswer: null,
      acceptedAnswers: null,
      timeLimitSeconds: 120,
      requiredTowerHeight: 12,
      maxAttempts: null,
      hint: null,
      hintAvailable: false,
      isActive: true,
      revealAnswerOnFail: false,
      orderIndex: 2
    },
    create: {
      roundNumber: 1,
      taskNumber: 2,
      orderIndex: 2,
      title: "Pirate Tower",
      description:
        "Demo-editable physical verification task. Build the tallest tower within the time limit. Admin/operator confirms completion.",
      pseudocode: null,
      question: "Submit your tower for operator verification once the required height is reached.",
      answerType: AnswerType.TOWER_VERIFICATION,
      correctAnswer: null,
      acceptedAnswers: null,
      timeLimitSeconds: 120,
      requiredTowerHeight: 12,
      maxAttempts: null,
      hint: null,
      hintAvailable: false,
      isActive: true,
      revealAnswerOnFail: false
    }
  });

  const demoTeam = await prisma.team.upsert({
    where: { teamCode: "BLACK-PEARL" },
    update: {},
    create: {
      teamCode: "BLACK-PEARL",
      teamName: "BLACK PEARL",
      normalizedName: "black pearl",
      status: "PENDING",
      isTestTeam: true
    }
  });

  await prisma.teamTaskState.upsert({
    where: {
      teamId_taskId: {
        teamId: demoTeam.id,
        taskId: taskOne.id
      }
    },
    update: {
      status: TaskStateStatus.AVAILABLE
    },
    create: {
      teamId: demoTeam.id,
      taskId: taskOne.id,
      status: TaskStateStatus.AVAILABLE
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
