import { randomUUID } from 'node:crypto';
import { type APIRequestContext, expect } from '@playwright/test';
import { type Channel, Socket } from 'phoenix';

export const API_BASE_URL = process.env.E2E_API_BASE_URL ?? 'https://openraccoon.com/api/v1';
export const WS_URL = normalizeSocketUrl(process.env.E2E_WS_URL ?? 'wss://openraccoon.com/socket');

type SeedUser = {
  username: string;
  email: string;
  password: string;
};

type AuthSession = {
  username: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  userId: string;
};

const seedUsers: Record<'alex' | 'maya', SeedUser> = {
  alex: {
    username: process.env.E2E_ALEX_USERNAME ?? 'alex_dev',
    email: process.env.E2E_ALEX_EMAIL ?? 'alex@openraccoon.com',
    password: process.env.E2E_ALEX_PASSWORD ?? 'TestPass123!',
  },
  maya: {
    username: process.env.E2E_MAYA_USERNAME ?? 'maya_writer',
    email: process.env.E2E_MAYA_EMAIL ?? 'maya@openraccoon.com',
    password: process.env.E2E_MAYA_PASSWORD ?? 'TestPass123!',
  },
};

const loginCache = new Map<string, Promise<AuthSession>>();

export function seededUser(key: 'alex' | 'maya'): SeedUser {
  return seedUsers[key];
}

export async function getSeedSession(
  request: APIRequestContext,
  key: 'alex' | 'maya',
): Promise<AuthSession> {
  const cacheKey = `seed:${key}`;

  const cached = loginCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const created = loginWithRetry(request, seededUser(key));
  loginCache.set(cacheKey, created);

  try {
    const session = await created;
    return session;
  } catch (error) {
    loginCache.delete(cacheKey);
    throw error;
  }
}

async function loginWithRetry(request: APIRequestContext, user: SeedUser): Promise<AuthSession> {
  let attempt = 0;

  while (attempt < 5) {
    const response = await request.post(`${API_BASE_URL}/auth/login`, {
      data: {
        email: user.email,
        password: user.password,
      },
    });

    if (response.status() === 429) {
      attempt += 1;
      await sleep(13_000);
      continue;
    }

    expect(response.status(), `Failed to login ${user.email}`).toBe(200);
    const payload = (await response.json()) as {
      user: { id: string; username: string; email: string };
      tokens: { access_token: string; refresh_token: string };
    };

    return {
      username: payload.user.username,
      email: payload.user.email,
      userId: payload.user.id,
      accessToken: payload.tokens.access_token,
      refreshToken: payload.tokens.refresh_token,
    };
  }

  throw new Error(`Auth rate limit persisted for ${user.email}`);
}

export async function apiCall<T = unknown>(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  options: {
    token?: string;
    data?: unknown;
    idempotencyKey?: string;
    expectedStatus?: number;
  } = {},
): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = {};

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  const response = await request.fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    data: options.data,
  });

  const status = response.status();
  if (options.expectedStatus !== undefined) {
    expect(status, `${method} ${path}`).toBe(options.expectedStatus);
  }

  const contentType = response.headers()['content-type'] ?? '';
  const body = contentType.includes('application/json')
    ? ((await response.json()) as T)
    : ((await response.text()) as T);

  return { status, body };
}

export async function connectSocket(token: string): Promise<Socket> {
  const socket = new Socket(WS_URL, {
    params: {
      token,
    },
  });

  await new Promise<void>((resolve, reject) => {
    const typedSocket = socket as unknown as {
      onOpen: (callback: () => void) => void;
      onError: (callback: (error: unknown) => void) => void;
    };

    const timeout = setTimeout(() => {
      reject(new Error('Timed out connecting websocket'));
    }, 10_000);

    typedSocket.onOpen(() => {
      clearTimeout(timeout);
      resolve();
    });

    typedSocket.onError((error) => {
      clearTimeout(timeout);
      reject(new Error(`Websocket connect error: ${String(error)}`));
    });

    socket.connect();
  });

  return socket;
}

export async function joinTopic(
  socket: Socket,
  topic: string,
  params: Record<string, unknown> = {},
): Promise<Channel> {
  const channel = socket.channel(topic, params);

  await new Promise<void>((resolve, reject) => {
    channel
      .join(10_000)
      .receive('ok', () => resolve())
      .receive('error', (error) =>
        reject(new Error(`Join ${topic} failed: ${JSON.stringify(error)}`)),
      )
      .receive('timeout', () => reject(new Error(`Join ${topic} timed out`)));
  });

  return channel;
}

export function waitForChannelEvent<T>(
  channel: Channel,
  event: string,
  timeoutMs = 20_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const channelAny = channel as unknown as {
      off: (event: string, ref: number) => void;
    };

    const timeout = setTimeout(() => {
      if (ref !== undefined) {
        channelAny.off(event, ref);
      }
      reject(new Error(`Timed out waiting for event '${event}'`));
    }, timeoutMs);

    const ref = channel.on(event, (payload) => {
      clearTimeout(timeout);
      channelAny.off(event, ref);
      resolve(payload as T);
    });
  });
}

export async function leaveAndDisconnect(
  channel: Channel | null,
  socket: Socket | null,
): Promise<void> {
  if (channel) {
    await new Promise<void>((resolve) => {
      channel
        .leave(3_000)
        .receive('ok', () => resolve())
        .receive('error', () => resolve())
        .receive('timeout', () => resolve());
    });
  }

  socket?.disconnect();
}

export function uniqueLabel(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

export function uniqueIdempotencyKey(): string {
  return randomUUID();
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSocketUrl(url: string): string {
  return url.endsWith('/websocket') ? url.slice(0, -10) : url;
}
