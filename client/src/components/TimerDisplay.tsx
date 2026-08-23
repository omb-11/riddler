import { useEffect, useMemo, useState } from "react";

function formatTime(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function TimerDisplay({
  deadlineAt,
  onWarning30,
  onWarning10
}: {
  deadlineAt: string | null;
  onWarning30?: () => void;
  onWarning10?: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  const [warned30, setWarned30] = useState(false);
  const [warned10, setWarned10] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setWarned30(false);
    setWarned10(false);
  }, [deadlineAt]);

  const remaining = useMemo(() => {
    if (!deadlineAt) {
      return null;
    }
    return Math.max(0, new Date(deadlineAt).getTime() - now);
  }, [deadlineAt, now]);

  useEffect(() => {
    if (remaining === null) {
      return;
    }

    if (remaining <= 30000 && !warned30) {
      setWarned30(true);
      onWarning30?.();
    }

    if (remaining <= 10000 && !warned10) {
      setWarned10(true);
      onWarning10?.();
    }
  }, [remaining, warned10, warned30, onWarning10, onWarning30]);

  if (remaining === null) {
    return <div className="timer timer-idle">--:--</div>;
  }

  const urgency =
    remaining <= 10000 ? "timer-danger" : remaining <= 30000 ? "timer-warning" : "";

  return <div className={`timer ${urgency}`}>{formatTime(remaining)}</div>;
}
