import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "../services/api";
import type { AdminDashboard } from "../types";

const defaultTaskForm = {
  roundNumber: 1,
  taskNumber: 1,
  orderIndex: 1,
  title: "",
  description: "",
  pseudocode: "",
  question: "",
  answerType: "TEXT",
  correctAnswer: "",
  acceptedAnswers: "",
  timeLimitSeconds: 60,
  requiredTowerHeight: "",
  maxAttempts: "",
  hint: "",
  hintAvailable: false,
  unlockCondition: "",
  isActive: true,
  revealAnswerOnFail: false
};

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [taskForm, setTaskForm] = useState(defaultTaskForm);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const dashboard = await api.getAdminDashboard();
      setData(dashboard);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        navigate("/admin/login");
        return;
      }
      setError(caught instanceof ApiError ? caught.message : "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleLogout() {
    await api.adminLogout();
    navigate("/admin/login");
  }

  async function runAction(action: () => Promise<unknown>, confirmationText?: string) {
    if (confirmationText && !window.confirm(confirmationText)) {
      return;
    }

    try {
      await action();
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Action failed.");
    }
  }

  async function submitTask(event: FormEvent) {
    event.preventDefault();

    const payload = {
      ...taskForm,
      pseudocode: taskForm.pseudocode.trim() || null,
      correctAnswer: taskForm.correctAnswer.trim() || null,
      acceptedAnswers: taskForm.acceptedAnswers.trim()
        ? taskForm.acceptedAnswers.split(",").map((entry) => entry.trim())
        : null,
      requiredTowerHeight: taskForm.requiredTowerHeight ? Number(taskForm.requiredTowerHeight) : null,
      maxAttempts: taskForm.maxAttempts ? Number(taskForm.maxAttempts) : null,
      hint: taskForm.hint.trim() || null,
      unlockCondition: taskForm.unlockCondition.trim() || null
    };

    await runAction(() => api.upsertTask(editingTaskId, payload));
    setTaskForm(defaultTaskForm);
    setEditingTaskId(null);
  }

  if (loading) {
    return <main className="admin-shell"><div className="admin-panel">Loading dashboard...</div></main>;
  }

  if (!data) {
    return <main className="admin-shell"><div className="admin-panel">{error ?? "No data."}</div></main>;
  }

  return (
    <main className="admin-shell">
      <section className="admin-topbar">
        <div>
          <span className="eyebrow">LIVE EVENT DASHBOARD</span>
          <h1>RIDDLER Control Room</h1>
        </div>
        <button type="button" className="ghost-button" onClick={handleLogout}>
          LOG OUT
        </button>
      </section>

      {error ? <p className="feedback error">{error}</p> : null}

      <section className="metrics-grid">
        <article className="metric"><span>Total Teams</span><strong>{data.summary.totalTeams}</strong></article>
        <article className="metric"><span>Active</span><strong>{data.summary.activeTeams}</strong></article>
        <article className="metric"><span>Completed</span><strong>{data.summary.completedTeams}</strong></article>
        <article className="metric"><span>Wrong Attempts</span><strong>{data.summary.wrongAttempts}</strong></article>
        <article className="metric"><span>Paused</span><strong>{data.summary.pausedTeams}</strong></article>
        <article className="metric"><span>Fullscreen Exits</span><strong>{data.summary.fullscreenInterruptions}</strong></article>
      </section>

      <section className="admin-columns">
        <div className="admin-panel">
          <div className="section-heading">
            <h2>Event Control</h2>
          </div>
          <div className="button-row">
            <button
              type="button"
              className="primary-button"
              onClick={() =>
                runAction(() => api.updateAdminConfig({ eventPaused: !data.config.eventPaused }))
              }
            >
              {data.config.eventPaused ? "RESUME EVENT" : "PAUSE EVENT"}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() =>
                runAction(() =>
                  api.updateAdminConfig({ submissionsLocked: !data.config.submissionsLocked })
                )
              }
            >
              {data.config.submissionsLocked ? "UNLOCK SUBMISSIONS" : "LOCK SUBMISSIONS"}
            </button>
            <button type="button" className="ghost-button" onClick={() => runAction(() => api.adminAction("/event/reset"), "Reset the event for all teams? This clears progress but keeps tasks and admin data.") }>
              RESET EVENT
            </button>
          </div>
          {import.meta.env.DEV ? (
            <div className="button-row">
              <button type="button" className="ghost-button small" onClick={() => runAction(() => api.simulateTeamScenario("new"), "Create a fresh demo team?")}>New team</button>
              <button type="button" className="ghost-button small" onClick={() => runAction(() => api.simulateTeamScenario("task1-active"), "Set a demo team to Task 1 active?")}>Task 1 active</button>
              <button type="button" className="ghost-button small" onClick={() => runAction(() => api.simulateTeamScenario("task1-complete"), "Mark a demo team as Task 1 complete?")}>Task 1 complete</button>
              <button type="button" className="ghost-button small" onClick={() => runAction(() => api.simulateTeamScenario("task2-active"), "Set a demo team to Task 2 active?")}>Task 2 active</button>
              <button type="button" className="ghost-button small" onClick={() => runAction(() => api.simulateTeamScenario("task2-complete"), "Mark a demo team as Task 2 complete?")}>Task 2 complete</button>
              <button type="button" className="ghost-button small" onClick={() => runAction(() => api.simulateTeamScenario("winner"), "Create a winner demo team?")}>Winner</button>
              <button type="button" className="ghost-button small" onClick={() => runAction(() => api.simulateTeamScenario("disqualified"), "Disqualify a demo team?")}>Disqualify</button>
            </div>
          ) : null}
          <div className="toggle-grid">
            <label><input type="checkbox" checked={data.config.pauseOnFullscreenExit} onChange={(e) => runAction(() => api.updateAdminConfig({ pauseOnFullscreenExit: e.target.checked }))} /> Pause on fullscreen exit</label>
            <label><input type="checkbox" checked={data.config.pauseOnTabHidden} onChange={(e) => runAction(() => api.updateAdminConfig({ pauseOnTabHidden: e.target.checked }))} /> Pause on tab hidden</label>
            <label><input type="checkbox" checked={data.config.musicEnabled} onChange={(e) => runAction(() => api.updateAdminConfig({ musicEnabled: e.target.checked }))} /> Music enabled</label>
            <label><input type="checkbox" checked={data.config.soundsEnabled} onChange={(e) => runAction(() => api.updateAdminConfig({ soundsEnabled: e.target.checked }))} /> Sounds enabled</label>
          </div>
        </div>

        <div className="admin-panel">
          <div className="section-heading">
            <h2>Winners</h2>
          </div>
          <ul className="winner-list">
            {data.winners.length ? (
              data.winners.map((winner) => (
                <li key={winner.id}>
                  <strong>#{winner.rank}</strong> {winner.teamName}{" "}
                  <span>{winner.completedAt ? new Date(winner.completedAt).toLocaleTimeString() : ""}</span>
                </li>
              ))
            ) : (
              <li>No team has completed the round yet.</li>
            )}
          </ul>
        </div>
      </section>

      <section className="admin-panel">
        <div className="section-heading">
          <h2>Teams</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Team</th>
                <th>Round</th>
                <th>Task</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Time</th>
                <th>Last Activity</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.teams.map((team) => (
                <tr key={team.id}>
                  <td>{team.teamName}</td>
                  <td>{team.currentRound}</td>
                  <td>{team.currentTask || "-"}</td>
                  <td>{team.status}</td>
                  <td>{team.attempts}</td>
                  <td>{team.timeRemainingMs !== null ? `${Math.ceil(team.timeRemainingMs / 1000)}s` : "-"}</td>
                  <td>{new Date(team.lastActivityAt).toLocaleTimeString()}</td>
                  <td>
                    <div className="inline-actions">
                      <button type="button" className="ghost-button small" onClick={() => runAction(() => api.adminAction(`/teams/${team.id}/advance`), `Advance ${team.teamName}?`)}>Advance</button>
                      <button type="button" className="ghost-button small" onClick={() => runAction(() => api.adminAction(`/teams/${team.id}/reset`), `Reset ${team.teamName}'s progress?`)}>Reset</button>
                      <button type="button" className="ghost-button small" onClick={() => runAction(() => api.adminAction(`/teams/${team.id}/disqualify`), `Disqualify ${team.teamName}?`)}>DQ</button>
                      {team.isTestTeam ? (
                        <button type="button" className="ghost-button small" onClick={() => runAction(() => api.adminAction(`/teams/${team.id}`, "DELETE"), `Delete test team ${team.teamName}?`) }>
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-columns">
        <div className="admin-panel">
          <div className="section-heading">
            <h2>Tasks</h2>
          </div>
          <ul className="task-admin-list">
            {data.tasks.map((task) => (
              <li key={task.id}>
                <div>
                  <strong>R{task.roundNumber} / T{task.taskNumber} - {task.title}</strong>
                  <p>{task.description}</p>
                </div>
                <div className="inline-actions">
                  <button
                    type="button"
                    className="ghost-button small"
                    onClick={() => {
                      setEditingTaskId(task.id);
                      setTaskForm({
                        roundNumber: task.roundNumber,
                        taskNumber: task.taskNumber,
                        orderIndex: task.orderIndex,
                        title: task.title,
                        description: task.description,
                        pseudocode: task.pseudocode ?? "",
                        question: task.question,
                        answerType: task.answerType,
                        correctAnswer: task.correctAnswer ?? "",
                        acceptedAnswers: Array.isArray(task.acceptedAnswers)
                          ? (task.acceptedAnswers as string[]).join(", ")
                          : "",
                        timeLimitSeconds: task.timeLimitSeconds,
                        requiredTowerHeight: task.requiredTowerHeight?.toString() ?? "",
                        maxAttempts: task.maxAttempts?.toString() ?? "",
                        hint: task.hint ?? "",
                        hintAvailable: task.hintAvailable,
                        unlockCondition: task.unlockCondition ?? "",
                        isActive: task.isActive,
                        revealAnswerOnFail: task.revealAnswerOnFail
                      });
                    }}
                  >
                    Edit
                  </button>
                  <button type="button" className="ghost-button small" onClick={() => runAction(() => api.deleteTask(task.id))}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="admin-panel">
          <div className="section-heading">
            <h2>{editingTaskId ? "Edit Task" : "Create Task"}</h2>
          </div>
          <form className="stack-form" onSubmit={submitTask}>
            <label><span>Title</span><input value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} required /></label>
            <label><span>Description</span><textarea value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} required /></label>
            <label><span>Pseudocode</span><textarea value={taskForm.pseudocode} onChange={(e) => setTaskForm({ ...taskForm, pseudocode: e.target.value })} /></label>
            <label><span>Question</span><textarea value={taskForm.question} onChange={(e) => setTaskForm({ ...taskForm, question: e.target.value })} required /></label>
            <div className="split-grid">
              <label><span>Round</span><input type="number" value={taskForm.roundNumber} onChange={(e) => setTaskForm({ ...taskForm, roundNumber: Number(e.target.value) })} required /></label>
              <label><span>Task</span><input type="number" value={taskForm.taskNumber} onChange={(e) => setTaskForm({ ...taskForm, taskNumber: Number(e.target.value) })} required /></label>
              <label><span>Order</span><input type="number" value={taskForm.orderIndex} onChange={(e) => setTaskForm({ ...taskForm, orderIndex: Number(e.target.value) })} required /></label>
              <label><span>Type</span><select value={taskForm.answerType} onChange={(e) => setTaskForm({ ...taskForm, answerType: e.target.value })}><option value="TEXT">TEXT</option><option value="NUMBER">NUMBER</option><option value="MULTIPLE_CHOICE">MULTIPLE_CHOICE</option><option value="TOWER_VERIFICATION">TOWER_VERIFICATION</option></select></label>
            </div>
            <div className="split-grid">
              <label><span>Correct Answer</span><input value={taskForm.correctAnswer} onChange={(e) => setTaskForm({ ...taskForm, correctAnswer: e.target.value })} /></label>
              <label><span>Accepted Answers</span><input value={taskForm.acceptedAnswers} onChange={(e) => setTaskForm({ ...taskForm, acceptedAnswers: e.target.value })} placeholder="comma,separated,values" /></label>
            </div>
            <div className="split-grid">
              <label><span>Timer (s)</span><input type="number" value={taskForm.timeLimitSeconds} onChange={(e) => setTaskForm({ ...taskForm, timeLimitSeconds: Number(e.target.value) })} required /></label>
              <label><span>Max Attempts</span><input type="number" value={taskForm.maxAttempts} onChange={(e) => setTaskForm({ ...taskForm, maxAttempts: e.target.value })} /></label>
              <label><span>Required Height</span><input type="number" value={taskForm.requiredTowerHeight} onChange={(e) => setTaskForm({ ...taskForm, requiredTowerHeight: e.target.value })} /></label>
            </div>
            <label><span>Hint</span><input value={taskForm.hint} onChange={(e) => setTaskForm({ ...taskForm, hint: e.target.value })} /></label>
            <label><span>Unlock Condition</span><input value={taskForm.unlockCondition} onChange={(e) => setTaskForm({ ...taskForm, unlockCondition: e.target.value })} /></label>
            <div className="toggle-grid">
              <label><input type="checkbox" checked={taskForm.hintAvailable} onChange={(e) => setTaskForm({ ...taskForm, hintAvailable: e.target.checked })} /> Hint available</label>
              <label><input type="checkbox" checked={taskForm.isActive} onChange={(e) => setTaskForm({ ...taskForm, isActive: e.target.checked })} /> Active</label>
              <label><input type="checkbox" checked={taskForm.revealAnswerOnFail} onChange={(e) => setTaskForm({ ...taskForm, revealAnswerOnFail: e.target.checked })} /> Reveal answer on fail</label>
            </div>
            <div className="button-row">
              <button type="submit" className="primary-button">{editingTaskId ? "SAVE TASK" : "CREATE TASK"}</button>
              {editingTaskId ? (
                <button type="button" className="ghost-button" onClick={() => { setEditingTaskId(null); setTaskForm(defaultTaskForm); }}>
                  CANCEL
                </button>
              ) : null}
            </div>
          </form>
        </div>
      </section>

      <section className="admin-panel">
        <div className="section-heading">
          <h2>Activity Timeline</h2>
        </div>
        <ul className="event-list">
          {data.events.map((event) => (
            <li key={event.id}>
              <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
              <strong>{event.eventType}</strong>
              <em>{event.teamName ?? "SYSTEM"}</em>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
