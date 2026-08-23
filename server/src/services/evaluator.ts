import { AnswerType, type Task } from "@prisma/client";

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeAnswer(value: string, answerType: AnswerType) {
  const trimmed = normalizeWhitespace(value);

  if (answerType === AnswerType.NUMBER) {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? String(parsed) : trimmed;
  }

  if (answerType === AnswerType.TEXT || answerType === AnswerType.MULTIPLE_CHOICE) {
    return trimmed.toLowerCase();
  }

  return trimmed;
}

export function evaluateAnswer(task: Task, rawAnswer: string) {
  if (task.answerType === AnswerType.TOWER_VERIFICATION) {
    return {
      normalizedAnswer: normalizeAnswer(rawAnswer, task.answerType),
      isCorrect: false
    };
  }

  const normalizedAnswer = normalizeAnswer(rawAnswer, task.answerType);
  const acceptedAnswers = Array.isArray(task.acceptedAnswers)
    ? task.acceptedAnswers.map((entry) =>
        normalizeAnswer(String(entry), task.answerType)
      )
    : [];

  const canonicalAnswer = task.correctAnswer
    ? normalizeAnswer(task.correctAnswer, task.answerType)
    : null;

  const allowed = new Set<string>();

  if (canonicalAnswer) {
    allowed.add(canonicalAnswer);
  }

  for (const answer of acceptedAnswers) {
    allowed.add(answer);
  }

  return {
    normalizedAnswer,
    isCorrect: allowed.has(normalizedAnswer)
  };
}
