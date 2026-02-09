declare const process: { env: Record<string, string | undefined> };

const API_BASE =
  typeof window === "undefined"
    ? (process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000")
    : (process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000");
const WS_BASE = API_BASE.replace(/^http/, "ws");
const TELLO_BASE = process.env.NEXT_PUBLIC_TELLO_BASE_URL ?? "http://localhost:8888";

function headers(token?: string | null): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    h["Authorization"] = `Bearer ${token}`;
  }
  return h;
}

async function handleRes<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    const body = await res.json().catch(() => ({}));
    // Trigger automatic logout on 401
    if (typeof window !== "undefined") {
      import("next-auth/react").then(({ signOut }) => {
        signOut({ redirect: true, callbackUrl: "/login" });
      });
    }
    throw new Error((body.detail as string) ?? "Incorrect email or password");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const errorMsg = (body.detail as string) ?? `HTTP ${res.status}`;
    throw new Error(errorMsg);
  }
  if (res.headers.get("content-type")?.includes("application/json")) return res.json() as Promise<T>;
  return undefined as unknown as T;
}

export const api = {
  base: API_BASE,
  wsBase: WS_BASE,

  async backendReachable(timeoutMs = 3000): Promise<boolean> {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeoutMs);
    try {
      const res = await fetch(`${API_BASE}/health`, { signal: c.signal });
      clearTimeout(t);
      return res.ok;
    } catch {
      clearTimeout(t);
      return false;
    }
  },

  auth: {
    async login(email: string, password: string): Promise<{ access_token: string; token_type: string }> {
      const params = new URLSearchParams();
      params.append("username", email); // OAuth2PasswordRequestForm uses "username" field
      params.append("password", password);
      const url = `${API_BASE}/auth/login`;
      const timeoutMs = 8000;
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString(),
          signal: c.signal,
        });
        clearTimeout(t);
        return handleRes(res);
      } catch (err) {
        clearTimeout(t);
        if (err instanceof Error && err.name === "AbortError") {
          throw new Error("Request timed out. Is the backend running at " + API_BASE + "?");
        }
        throw err;
      }
    },

    async register(user: { email: string; password: string }): Promise<{ id: number; email: string; is_active: boolean }> {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(user),
      });
      return handleRes(res);
    },

    async logout(token: string | null): Promise<void> {
      if (!token) return;
      const res = await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: headers(token),
      });
      if (!res.ok && res.status !== 401) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body.detail as string) ?? `HTTP ${res.status}`);
      }
    },

    async me(token: string | null): Promise<{ id: number; email: string; is_active: boolean } | null> {
      if (!token) return null;
      const res = await fetch(`${API_BASE}/auth/me`, { headers: headers(token) });
      if (res.status === 401) return null;
      if (!res.ok) return null;
      return res.json();
    },
  },


  brainwaves: {
    async get(token?: string | null): Promise<Record<string, unknown>[]> {
      const res = await fetch(`${API_BASE}/brainwaves`, { headers: headers(token) });
      return handleRes(res);
    },
  },

  eeg: {
    async getStatus(token?: string | null): Promise<{ connected: boolean; message: string; sample_count: number; band_powers: Record<string, { power: number; range: [number, number] }>; has_data: boolean }> {
      const res = await fetch(`${API_BASE}/eeg/status`, { headers: headers(token) });
      return handleRes(res);
    },
    async reconnect(token?: string | null): Promise<{ success: boolean; message: string }> {
      const res = await fetch(`${API_BASE}/eeg/reconnect`, {
        method: "POST",
        headers: headers(token),
      });
      return handleRes(res);
    },
  },

  tello: {
    base: TELLO_BASE,
    videoUrl(): string {
      return `${TELLO_BASE}/video`;
    },
    async startStream(): Promise<{ success: boolean; message?: string }> {
      const res = await fetch(`${TELLO_BASE}/video/start`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      const msg = data.detail ?? data.message ?? (res.ok ? "OK" : "Failed to start stream");
      return { success: res.ok, message: msg };
    },
    async stopStream(): Promise<{ success: boolean; message?: string }> {
      const res = await fetch(`${TELLO_BASE}/video/stop`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      return { success: res.ok, message: data.message };
    },
    async health(): Promise<{ status: string; tello_connected: boolean; video_receiver_running?: boolean; video_has_frames?: boolean } | null> {
      try {
        const res = await fetch(`${TELLO_BASE}/health`);
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
    async battery(): Promise<{ battery: number | null; message?: string }> {
      try {
        const res = await fetch(`${TELLO_BASE}/battery`);
        const data = await res.json().catch(() => ({}));
        return { battery: data.battery ?? null, message: data.message };
      } catch {
        return { battery: null };
      }
    },
  },

  logs: {
    async get(token?: string | null): Promise<{ logs: string[] }> {
      const res = await fetch(`${API_BASE}/log_action`, { headers: headers(token) });
      return handleRes(res);
    },
  },

  training: {
    async createSession(data: { data: Record<string, unknown>; notes?: string; name?: string }, token?: string | null): Promise<{ id: number; user_id: number; name: string | null; started_at: string; ended_at: string | null; duration_seconds: number | null; data: Record<string, unknown>; notes: string | null; created_at: string }> {
      const res = await fetch(`${API_BASE}/training/sessions`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify(data),
      });
      return handleRes(res);
    },

    async endSession(sessionId: number, data?: Record<string, unknown>, token?: string | null): Promise<{ id: number; user_id: number; name: string | null; started_at: string; ended_at: string | null; duration_seconds: number | null; data: Record<string, unknown>; notes: string | null; created_at: string }> {
      const res = await fetch(`${API_BASE}/training/sessions/${sessionId}/end`, {
        method: "PUT",
        headers: headers(token),
        body: data ? JSON.stringify(data) : undefined,
      });
      return handleRes(res);
    },

    async getSessions(token?: string | null): Promise<{ id: number; user_id: number; name: string | null; started_at: string; ended_at: string | null; duration_seconds: number | null; data: Record<string, unknown>; notes: string | null; created_at: string }[]> {
      const res = await fetch(`${API_BASE}/training/sessions`, { headers: headers(token) });
      return handleRes(res);
    },

    async getSession(sessionId: number, token?: string | null): Promise<{ id: number; user_id: number; name: string | null; started_at: string; ended_at: string | null; duration_seconds: number | null; data: Record<string, unknown>; notes: string | null; created_at: string }> {
      const res = await fetch(`${API_BASE}/training/sessions/${sessionId}`, { headers: headers(token) });
      return handleRes(res);
    },

    async updateSession(sessionId: number, patch: { name?: string | null; notes?: string | null }, token?: string | null): Promise<{ id: number; user_id: number; name: string | null; started_at: string; ended_at: string | null; duration_seconds: number | null; data: Record<string, unknown>; notes: string | null; created_at: string }> {
      const res = await fetch(`${API_BASE}/training/sessions/${sessionId}`, {
        method: "PATCH",
        headers: headers(token),
        body: JSON.stringify(patch),
      });
      return handleRes(res);
    },

    async classifySession(sessionId: number, token?: string | null): Promise<{ action: string; confidence: number; reasoning: string }> {
      const res = await fetch(`${API_BASE}/training/sessions/${sessionId}/classify`, { headers: headers(token) });
      return handleRes(res);
    },

    async deleteAllSessions(token?: string | null): Promise<{ deleted_bindings: number; deleted_sessions: number }> {
      const res = await fetch(`${API_BASE}/training/sessions`, { method: "DELETE", headers: headers(token) });
      return handleRes(res);
    },
  },

  machines: {
    async create(data: { name: string; type: string }, token?: string | null): Promise<{ id: number; user_id: number; name: string; type: string; created_at: string }> {
      const res = await fetch(`${API_BASE}/machines`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify(data),
      });
      return handleRes(res);
    },

    async getAll(token?: string | null): Promise<{ id: number; user_id: number; name: string; type: string; created_at: string }[]> {
      const res = await fetch(`${API_BASE}/machines`, { headers: headers(token) });
      return handleRes(res);
    },

    async get(machineId: number, token?: string | null): Promise<{ id: number; user_id: number; name: string; type: string; control_positions?: Array<{ id: string; description?: string; x: number; y: number; icon?: string; bgColor?: string; webhook_url?: string }> | null; blueprint?: string | null; created_at: string }> {
      const res = await fetch(`${API_BASE}/machines/${machineId}`, { headers: headers(token) });
      return handleRes(res);
    },

    async delete(machineId: number, token?: string | null): Promise<void> {
      try {
        const res = await fetch(`${API_BASE}/machines/${machineId}`, {
          method: "DELETE",
          headers: headers(token),
        });
        if (!res.ok && res.status !== 204) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body.detail as string) ?? `HTTP ${res.status}`);
        }
      } catch (err) {
        // Only treat as network error if it's actually a network error
        if (err instanceof TypeError && err.message === "Failed to fetch") {
          throw new Error("Unable to connect to the server. Please check if the backend is running.");
        }
        // Re-throw other errors (including HTTP errors from the backend)
        throw err;
      }
    },

    async createBinding(machineId: number, data: { control_id: string; training_session_id: number }, token?: string | null): Promise<{ id: number; machine_id: number; control_id: string; training_session_id: number; user_id: number; created_at: string }> {
      const res = await fetch(`${API_BASE}/machines/${machineId}/bindings`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify(data),
      });
      return handleRes(res);
    },

    async getBindings(machineId: number, token?: string | null): Promise<{ id: number; machine_id: number; control_id: string; training_session_id: number; user_id: number; created_at: string }[]> {
      const res = await fetch(`${API_BASE}/machines/${machineId}/bindings`, { headers: headers(token) });
      return handleRes(res);
    },

    async getControlBinding(machineId: number, controlId: string, token?: string | null): Promise<{ id: number; machine_id: number; control_id: string; training_session_id: number; user_id: number; created_at: string }> {
      const res = await fetch(`${API_BASE}/machines/${machineId}/bindings/${controlId}`, { headers: headers(token) });
      return handleRes(res);
    },

    async deleteBinding(bindingId: number, token?: string | null): Promise<void> {
      const res = await fetch(`${API_BASE}/machines/bindings/${bindingId}`, {
        method: "DELETE",
        headers: headers(token),
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body.detail as string) ?? `HTTP ${res.status}`);
      }
    },

    // positions: array of controls; tokenOrViewport: either token string (backward-compat) or viewport object
    async updatePositions(machineId: number, positions: Array<{ id: string; description?: string; x: number; y: number; icon?: string; bgColor?: string; webhook_url?: string }>, tokenOrViewport?: any, token?: string | null): Promise<any> {
      let viewport: any = undefined;
      let realToken: string | null = null;
      if (typeof tokenOrViewport === "string" || tokenOrViewport === undefined) {
        realToken = tokenOrViewport ?? token ?? null;
      } else {
        viewport = tokenOrViewport;
        realToken = token ?? null;
      }

      const body: any = { control_positions: positions };
      if (viewport !== undefined) body.viewport = viewport;

      const res = await fetch(`${API_BASE}/machines/${machineId}/positions`, {
        method: "PUT",
        headers: headers(realToken),
        body: JSON.stringify(body),
      });
      return handleRes(res);
    },

    async triggerWebhook(machineId: number, data: { control_id: string; webhook_url: string; value?: number }, token?: string | null): Promise<{ id: number; machine_id: number; control_id: string; webhook_url: string; value: number | null; success: boolean; status_code: number | null; error_message: string | null; response_data: string | null; created_at: string }> {
      const res = await fetch(`${API_BASE}/machines/${machineId}/trigger-webhook`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify(data),
      });
      return handleRes(res);
    },

    async getLogs(machineId: number, limit?: number, token?: string | null): Promise<{ id: number; machine_id: number; control_id: string; webhook_url: string; value: number | null; success: boolean; status_code: number | null; error_message: string | null; response_data: string | null; created_at: string }[]> {
      const params = limit ? `?limit=${limit}` : "";
      const res = await fetch(`${API_BASE}/machines/${machineId}/logs${params}`, { headers: headers(token) });
      return handleRes(res);
    },

  },

  suggestions: {
    async getSuggestions(combinationCounts: Record<string, number>): Promise<{ use_fallback: boolean; sentence?: string; top?: string[]; rare?: string[] }> {
      const res = await fetch(`${API_BASE}/suggestions/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ combination_counts: combinationCounts }),
      });
      if (!res.ok) return { use_fallback: true };
      return res.json();
    },
  },

  ws: {
    create(): WebSocket {
      return new WebSocket(`${WS_BASE}/ws`);
    },
    createEeg(): WebSocket {
      return new WebSocket(`${WS_BASE}/ws/eeg`);
    },
  },
};

export default api;
