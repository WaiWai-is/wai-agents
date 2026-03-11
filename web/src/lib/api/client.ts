import { ApiError, parseApiError } from "./errors";

export type SessionStoreAdapter = {
  getRefreshToken: () => string | undefined;
  setTokens: (accessToken: string, refreshToken: string) => void;
  clearSession: () => void;
};

export type ApiClientOptions = {
  baseUrl?: string;
  getAccessToken?: () => string | undefined | Promise<string | undefined>;
  fetchImpl?: typeof fetch;
  sessionStore?: SessionStoreAdapter;
};

export class ApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken?: ApiClientOptions["getAccessToken"];
  private readonly fetchImpl: typeof fetch;
  private readonly sessionStore?: SessionStoreAdapter;
  private refreshPromise: Promise<boolean> | null = null;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
    this.getAccessToken = options.getAccessToken;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.sessionStore = options.sessionStore;
  }

  async request<T>(path: string, init: RequestInit = {}, isRetry = false): Promise<T> {
    const token = this.getAccessToken ? await this.getAccessToken() : undefined;
    const headers = new Headers(init.headers);

    if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      cache: "no-store"
    });

    const contentType = response.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");
    const payload = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      if (response.status === 401 && !isRetry && this.sessionStore) {
        const refreshed = await this.tryRefreshToken();
        if (refreshed) {
          return this.request<T>(path, init, true);
        }
      }
      throw parseApiError(response.status, payload);
    }

    return payload as T;
  }

  private async tryRefreshToken(): Promise<boolean> {
    if (!this.sessionStore) {
      return false;
    }

    // Deduplicate concurrent refresh attempts
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.doRefreshToken();

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async doRefreshToken(): Promise<boolean> {
    const refreshToken = this.sessionStore!.getRefreshToken();
    if (!refreshToken) {
      this.sessionStore!.clearSession();
      return false;
    }

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
        cache: "no-store"
      });

      if (!response.ok) {
        this.sessionStore!.clearSession();
        return false;
      }

      const data = await response.json();
      const newAccessToken: string | undefined = data.access_token ?? data.tokens?.access_token;
      const newRefreshToken: string | undefined = data.refresh_token ?? data.tokens?.refresh_token;

      if (!newAccessToken) {
        this.sessionStore!.clearSession();
        return false;
      }

      this.sessionStore!.setTokens(newAccessToken, newRefreshToken ?? refreshToken);
      return true;
    } catch {
      this.sessionStore!.clearSession();
      return false;
    }
  }

  static isApiError(error: unknown): error is ApiError {
    return error instanceof ApiError;
  }
}
