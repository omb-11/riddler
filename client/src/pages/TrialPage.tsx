import { FormEvent, useEffect, useMemo, useState } from "react";
import { ApiError, api } from "../services/api";
import type { TeamState, TeamTask } from "../types";
import { AudioDock } from "../components/AudioDock";
import { FullscreenOverlay } from "../components/FullscreenOverlay";
import { PseudocodePanel } from "../components/PseudocodePanel";
import { TimerDisplay } from "../components/TimerDisplay";
import { useAudio } from "../hooks/useAudio";
import { useFullscreenGuard } from "../hooks/useFullscreenGuard";

function getCurrentTask(team: TeamState | null) {
  if (!team) {
    return null;
  }

  return (
    team.tasks.find((task) => task.status === "IN_PROGRESS") ??
    team.tasks.find((task) => task.status === "AVAILABLE") ??
    team.tasks.find((task) => task.status === "COMPLETED") ??
    null
  );
}

export function TrialPage({
  team,
  setTeam
}: {
  team: TeamState | null;
  setTeam: (team: TeamState | null) => void;
}) {
  const [teamName, setTeamName] = useState("");
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [towerMessage, setTowerMessage] = useState<string | null>(null);
  const currentTask = useMemo(() => getCurrentTask(team), [team]);
  const audio = useAudio(
    team?.config.musicTrackPath,
    team?.config.musicEnabled ?? true,
    team?.config.soundsEnabled ?? true
  );
  const fullscreen = useFullscreenGuard({
    enabled: Boolean(team),
    pauseOnHidden: team?.config.pauseOnTabHidden ?? false
  });

  useEffect(() => {
    if (team?.status === "COMPLETED") {
      audio.playSound("victory");
    }
  }, [team?.status]);

  async function handleCreateSession(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await api.createTeamSession(teamName);
      setTeam(response.team);
      await fullscreen.requestFullscreen();
      await audio.unlockAndPlay();
      audio.playSound("click");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not enter the trial.");
    } finally {
      setLoading(false);
    }
  }

  async function beginTrial() {
    setLoading(true);
    setError(null);

    try {
      const response = await api.beginTrial();
      setTeam(response.team);
      audio.playSound("unlock");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not begin the trial.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitAnswer(event: FormEvent) {
    event.preventDefault();

    if (!currentTask) {
      return;
    }

    setLoading(true);
    setFeedback(null);
    setError(null);

    try {
      const response = await api.submitAnswer(currentTask.id, answer);
      setTeam(response.team);

      if (response.correct) {
        setFeedback("TASK CLEARED");
        setAnswer("");
        audio.playSound("success");
      } else {
        setFeedback("NOT QUITE, CREW.");
        audio.playSound("error");
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Submission failed.");
      audio.playSound("error");
    } finally {
      setLoading(false);
    }
  }

  async function handleTowerSubmit(task: TeamTask) {
    setLoading(true);
    setTowerMessage(null);
    setError(null);

    try {
      const response = await api.submitTower(task.id);
      setTowerMessage(response.message);
      audio.playSound("click");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Submission failed.");
      audio.playSound("error");
    } finally {
      setLoading(false);
    }
  }

  async function handleResume() {
    await fullscreen.requestFullscreen();
    const response = await api.resumeTrial();
    setTeam(response.team);
    fullscreen.clearInterrupted();
    audio.playSound("click");
  }

  if (!team) {
    return (
      <main className="trial-shell">
        <section className="hero-panel">
          <span className="eyebrow">WELCOME, CREW</span>
          <h1>RIDDLER</h1>
          <p className="tagline">ENTER THE TRIAL. SOLVE THE RIDDLE. CLAIM THE TREASURE.</p>
          <form className="stack-form" onSubmit={handleCreateSession}>
            <label>
              <span>ENTER YOUR TEAM NAME</span>
              <input
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                placeholder="Team Name"
                maxLength={40}
                required
              />
            </label>
            {error ? <p className="feedback error">{error}</p> : null}
            <button type="submit" className="primary-button" disabled={loading}>
              {loading ? "ENTERING..." : "ENTER THE TRIAL"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  const showRules = team.status === "PENDING" || team.currentTask === 0;
  const showWin = team.status === "COMPLETED";
  const task = currentTask;

  return (
    <main className="trial-shell app-shell">
      <FullscreenOverlay
        visible={fullscreen.interrupted || team.status === "PAUSED"}
        supported={fullscreen.supported}
        onResume={handleResume}
      />

      <div className="app-frame">
        <header className="trial-header">
          <div>
            <span className="brand">RIDDLER</span>
            <p>ROUND 01 / TASK {team.currentTask || "00"}</p>
          </div>
          <div className="header-side">
            {task ? (
              <TimerDisplay
                deadlineAt={task.deadlineAt}
                onWarning30={() => audio.playSound("warning")}
                onWarning10={() => audio.playSound("warning")}
              />
            ) : null}
          </div>
        </header>

        <section className="trial-content">
          {showRules ? (
            <div className="content-panel">
              <span className="eyebrow">ROUND 01</span>
              <h2>THE PIRATE TRIALS</h2>
              <p>
                Task 1 begins with the Mystery Box. Identify the physical clue, solve the challenge, and unlock Pirate Tower.
              </p>
              <ul className="rule-list">
                <li>Mystery Box: 60 seconds, touch only.</li>
                <li>Pirate Tower: 2 minutes, every member contributes.</li>
                <li>The first crew to clear Round 1 wins the Pirate Map clue.</li>
              </ul>
              {error ? <p className="feedback error">{error}</p> : null}
              <button type="button" className="primary-button" onClick={beginTrial} disabled={loading}>
                BEGIN TRIAL
              </button>
            </div>
          ) : showWin ? (
            <div className="content-panel success-state">
              <span className="eyebrow">TRIAL COMPLETE</span>
              <h2>THE MAP AWAITS.</h2>
              <p>Report to the event coordinator to receive your Pirate Map clue.</p>
              <p className="fine-print">Progress is recorded. Do not close the device until confirmed.</p>
            </div>
          ) : task ? (
            <div className="content-panel">
              <div className="task-meta">
                <span className="eyebrow">TASK {task.taskNumber.toString().padStart(2, "0")}</span>
                <h2>{task.title.toUpperCase()}</h2>
                <p>{task.description}</p>
              </div>

              <PseudocodePanel pseudocode={task.pseudocode} question={task.question} />

              {task.answerType === "TOWER_VERIFICATION" ? (
                <section className="challenge-block">
                  <div className="tower-spec">
                    <p>Required Height: <strong>{task.requiredTowerHeight ?? "-"}</strong></p>
                    <p>Once the tower meets the requirement, submit it for operator verification.</p>
                  </div>
                  {towerMessage ? <p className="feedback success">{towerMessage}</p> : null}
                  {error ? <p className="feedback error">{error}</p> : null}
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => handleTowerSubmit(task)}
                    disabled={loading}
                  >
                    SUBMIT CHALLENGE
                  </button>
                </section>
              ) : (
                <form className="answer-form" onSubmit={handleSubmitAnswer}>
                  <label>
                    <span>ANSWER</span>
                    <input
                      value={answer}
                      onChange={(event) => setAnswer(event.target.value)}
                      placeholder="Enter your answer"
                      required
                    />
                  </label>
                  {task.hint ? <p className="hint-text">Hint: {task.hint}</p> : null}
                  {feedback ? (
                    <p className={`feedback ${feedback === "TASK CLEARED" ? "success" : "error"}`}>{feedback}</p>
                  ) : null}
                  {error ? <p className="feedback error">{error}</p> : null}
                  <button type="submit" className="primary-button" disabled={loading}>
                    CHECK ANSWER
                  </button>
                </form>
              )}
            </div>
          ) : (
            <div className="content-panel">
              <p>No active challenge is available.</p>
            </div>
          )}
        </section>

        <AudioDock
          muted={audio.isMuted}
          volume={audio.volume}
          onToggleMute={audio.toggleMute}
          onVolumeChange={audio.setVolume}
        />
      </div>
    </main>
  );
}
