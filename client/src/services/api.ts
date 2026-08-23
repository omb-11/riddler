import type { AdminDashboard, TeamState } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "message" in payload
        ? String((payload as { message: string }).message)
        : "Request failed.";
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}

export const api = {
  async getSession() {
    return request<{ team: TeamState | null }>("/session", {
      method: "GET"
    });
  },
  async createTeamSession(teamName: string) {
    return request<{ team: TeamState }>("/teams/session", {
      method: "POST",
      body: JSON.stringify({ teamName })
    });
  },
  async beginTrial() {
    return request<{ team: TeamState }>("/trial/begin", {
      method: "POST"
    });
  },
  async resumeTrial() {
    return request<{ team: TeamState }>("/trial/resume", {
      method: "POST"
    });
  },
  async submitAnswer(taskId: string, answer: string) {
    return request<{
      correct: boolean;
      revealAnswer: string | null;
      team: TeamState;
      taskState: TeamState["tasks"][number] | undefined;
    }>(`/tasks/${taskId}/submit`, {
      method: "POST",
      body: JSON.stringify({ answer })
    });
  },
  async submitTower(taskId: string) {
    return request<{ success: boolean; message: string }>(`/tasks/${taskId}/tower-submit`, {
      method: "POST"
    });
  },
  async logEvent(
    eventType: "FULLSCREEN_ENTERED" | "FULLSCREEN_EXITED" | "TAB_HIDDEN" | "TAB_VISIBLE",
    metadata?: Record<string, unknown>
  ) {
    return request<{ team: TeamState | null }>("/events", {
      method: "POST",
      body: JSON.stringify({ eventType, metadata })
    });
  },
  async adminLogin(email: string, password: string) {
    return request<{ admin: { id: string; email: string } }>("/admin/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
  },
  async adminLogout() {
    return request<{ success: boolean }>("/admin/logout", { method: "POST" });
  },
  async adminMe() {
    return request<{ admin: { id: string; email: string } }>("/admin/me", { method: "GET" });
  },
  async getAdminDashboard() {
    return request<AdminDashboard>("/admin/dashboard", { method: "GET" });
  },
  async updateAdminConfig(payload: Record<string, unknown>) {
    return request<{ config: unknown }>("/admin/config", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  async adminAction(path: string, method: "POST" | "DELETE" = "POST") {
    return request<{ success: boolean }>(`/admin${path}`, { method });
  },
  async simulateTeamScenario(scenario: string, teamName?: string) {
    return request<{ success: boolean; team: unknown }>("/admin/dev/simulate", {
      method: "POST",
      body: JSON.stringify({ scenario, teamName })
    });
  },
  async upsertTask(taskId: string | null, payload: Record<string, unknown>) {
    return request<{ task: unknown }>(taskId ? `/admin/tasks/${taskId}` : "/admin/tasks", {
      method: taskId ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
  },
  async deleteTask(taskId: string) {
    return request<{ success: boolean }>(`/admin/tasks/${taskId}`, {
      method: "DELETE"
    });
  }
};

export { ApiError };
