import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
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
  const [manualQrCode, setManualQrCode] = useState("");
  const [qrPayload, setQrPayload] = useState("");
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [towerMessage, setTowerMessage] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const scannerRef = useRef<Html5Qrcode | null>(null);
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
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (team?.status === "COMPLETED") {
      audio.playSound("victory");
    }
  }, [team?.status]);

  useEffect(() => {
    if (!team || currentTask?.answerType !== "TOWER_VERIFICATION") {
      return;
    }

    const refresh = window.setInterval(() => {
      void api.getSession().then((response) => {
        if (response.team) {
          setTeam(response.team);
        }
      }).catch(() => undefined);
    }, 5000);

    return () => window.clearInterval(refresh);
  }, [team?.id, team?.status, currentTask?.id, currentTask?.answerType, setTeam]);

  useEffect(() => {
    if (!scannerOpen) {
      return;
    }

    const elementId = "riddler-camera-scan";
    const element = document.getElementById(elementId);

    if (!element) {
      return;
    }

    const scanner = new Html5Qrcode(elementId);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          try {
            await scanner.stop();
          } catch {
            // ignore stop failures
          }
          setQrPayload(decodedText);
          setScannerOpen(false);
          setError(null);
        },
        () => undefined
      )
      .catch(() => {
        setError("Camera access was denied or this device cannot scan QR codes.");
        setScannerOpen(false);
      });

    return () => {
      if (scannerRef.current) {
        void scannerRef.current.stop().catch(() => undefined);
        scannerRef.current = null;
      }
    };
  }, [scannerOpen]);

  async function handleCreateSession(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setToast(null);

    const trimmedTeamName = teamName.trim();

    if (!trimmedTeamName) {
      setError("Enter your crew name before entering the trial.");
      setLoading(false);
      return;
    }

    try {
      if (!qrPayload) {
        setError("Scan the crew QR to verify your team before entering the trial.");
        return;
      }

      const verification = await api.verifyTeamQr(trimmedTeamName, qrPayload);
      if (!verification.valid) {
        setError("The scanned QR does not belong to this crew.");
        return;
      }

      const response = await api.createTeamSession(trimmedTeamName, qrPayload);
      setTeam(response.team);
      setToast("Crew verified. The trail is live.");
      await fullscreen.requestFullscreen();
      await audio.unlockAndPlay();
      audio.playSound("click");
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : "Could not enter the trial.";
      setError(message);
      setToast(message);
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

  async function handleTestQr() {
    if (!teamName.trim()) {
      setError("Enter your crew name before using a test QR.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const response = await api.createTestQr(teamName.trim());
      setQrPayload(response.qrPayload);
      setFeedback("TEST QR READY");
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Test QR failed.");
    } finally {
      setLoading(false);
    }
  }

  if (!team) {
    const landingCards = [
      { title: "Map", caption: "A hidden route" },
      { title: "Signal", caption: "Stabilized" },
      { title: "Audio", caption: "Track ready" }
    ];

    return (
      <main className="trial-shell">
        <div className="sky-glow sky-glow-one" />
        <div className="sky-glow sky-glow-two" />

        <section className="hero-panel editorial-hero">
          <div className="hero-grid">
            <div className="hero-copy">
              <span className="eyebrow">RIDDLER / ROUND 01</span>
              <h1>THE PIRATE<br />TRIALS</h1>
              <p className="tagline">Every clue has a price. Every second matters.</p>
              <p className="small-description">A fast, atmospheric puzzle challenge where teams race through clues, timing, and hidden routes.</p>

              <div className="hero-metrics compact-metrics">
                <div className="metric-pill">
                  <span>Route</span>
                  <strong>Unmarked</strong>
                </div>
                <div className="metric-pill">
                  <span>Signal</span>
                  <strong>Live</strong>
                </div>
                <div className="metric-pill">
                  <span>Clock</span>
                  <strong>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong>
                </div>
              </div>
            </div>

            <div className="hero-visual" aria-hidden="true">
              <div className="compass-shell">
                <div className="compass-ring" />
                <div className="compass-ring inner" />
                <div className="compass-needle north" />
                <div className="compass-needle east" />
                <div className="compass-core" />
              </div>
            </div>
          </div>

          <form className="stack-form" onSubmit={handleCreateSession}>
            <label>
              <span>TEAM NAME</span>
              <input
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                placeholder="Enter your team name"
                maxLength={40}
                required
              />
            </label>

            <div className="qr-controls">
              <button type="button" className="ghost-button" onClick={() => setScannerOpen(true)} disabled={loading || !teamName.trim()}>
                SCAN CREW QR
              </button>
              <button type="button" className="ghost-button" onClick={handleTestQr} disabled={loading || !teamName.trim()}>
                USE TEST QR
              </button>
            </div>

            <label>
              <span>MANUAL QR CODE</span>
              <input
                value={manualQrCode}
                onChange={(event) => setManualQrCode(event.target.value)}
                placeholder="Paste or type the QR payload"
              />
            </label>
            <button
              type="button"
              className="ghost-button small"
              onClick={() => {
                const trimmed = manualQrCode.trim();
                if (!trimmed) {
                  setError("Paste a QR payload before continuing.");
                  return;
                }
                setQrPayload(trimmed);
                setFeedback("MANUAL QR LOADED");
                setError(null);
              }}
              disabled={loading || !teamName.trim()}
            >
              APPLY MANUAL QR
            </button>

            {qrPayload ? (
              <div className="qr-verified-box">
                <span>✓ CREW VERIFIED</span>
                <strong>{teamName.trim().toUpperCase()}</strong>
                <small>{qrPayload.slice(0, 18)}...</small>
              </div>
            ) : null}

            {error ? <p className="feedback error">{error}</p> : null}
            {feedback ? <p className="feedback success">{feedback}</p> : null}

            <button type="submit" className="primary-button" disabled={loading || !qrPayload}>
              {loading ? "VERIFYING..." : "ENTER THE TRIAL"}
            </button>
          </form>

          {scannerOpen ? (
            <div className="scanner-overlay" role="dialog" aria-modal="true">
              <div className="scanner-panel">
                <div className="scanner-header">
                  <span className="eyebrow">CREW QR SCAN</span>
                  <button type="button" className="ghost-button small" onClick={() => setScannerOpen(false)}>CLOSE</button>
                </div>
                <div id="riddler-camera-scan" className="camera-reader" />
                <p className="scanner-copy">Point your camera at the crew QR to verify the team.</p>
              </div>
            </div>
          ) : null}

          <div className="resource-band">
            {landingCards.map((card) => (
              <div key={card.title} className="resource-card">
                <span>{card.title}</span>
                <strong>{card.caption}</strong>
              </div>
            ))}
          </div>
        </section>
      </main>
    );
  }

  const showRules = team.status === "PENDING" || team.currentTask === 0;
  const showWin = team.status === "COMPLETED";
  const task = currentTask;
  const missionStats = [
    { label: "Crew", value: team.teamName },
    { label: "Score", value: `${team.score} pts` },
    { label: "Progress", value: `${team.progressPercent}%` },
    { label: "Rank", value: `#${team.rank}` }
  ];

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
            <p>CREW — {team.teamName.toUpperCase()} <span className="header-slash">/</span> ROUND 01 <span className="header-slash">/</span> TASK {team.currentTask || "00"}</p>
          </div>
          <div className="header-side">
            <span className="live-badge">LIVE</span>
            {task ? (
              <TimerDisplay
                deadlineAt={task.deadlineAt}
                onWarning30={() => audio.playSound("warning")}
                onWarning10={() => audio.playSound("warning")}
              />
            ) : null}
          </div>
        </header>

        <section className="trial-content mission-layout">
          <div className="mission-panel">
            {showRules ? (
              <div className="content-panel">
                <span className="eyebrow">ROUND 01</span>
                <h2>THE STAR MAP OPENS</h2>
                <p>
                  Task 1 begins with the Mystery Box. Identify the physical clue, solve the challenge, and unlock the hidden tower.
                </p>
                <ul className="rule-list">
                  <li>Mystery Box: 60 seconds, touch only.</li>
                  <li>Signal Tower: 2 minutes, every crew member contributes.</li>
                  <li>The first crew to clear Round 1 claims the lost route clue.</li>
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
                <p>Report to the event coordinator to receive your location clue.</p>
                <p className="fine-print">Progress is recorded. Remain on the device until confirmed.</p>
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
          </div>

          <aside className="mission-sidebar">
            <div className="sidebar-card">
              <span className="eyebrow small">MISSION BOARD</span>
              <div className="mini-grid">
                {missionStats.map((stat) => (
                  <div key={stat.label} className="mini-stat">
                    <span>{stat.label}</span>
                    <strong>{stat.value}</strong>
                  </div>
                ))}
              </div>
              <div className="progress-rail" aria-label="team progress">
                <span style={{ width: `${team.progressPercent}%` }} />
              </div>
              <p className="progress-copy">{team.completedTasks}/{team.totalTasks} clues cleared</p>
            </div>

            <div className="sidebar-card">
              <span className="eyebrow small">RESOURCE FILES</span>
              <ul className="resource-list">
                <li>Audio: ambient channel</li>
                <li>Route: Secret Map</li>
                <li>Signal: Live Relay</li>
              </ul>
            </div>
          </aside>
        </section>

        {toast ? <div className="game-toast">{toast}</div> : null}

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
