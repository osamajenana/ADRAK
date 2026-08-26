import { db } from '@/db/schema';

/**
 * The one place the app talks to the network.
 *
 * Every call can fail because there is no signal, and that is not an error condition here — it is
 * Tuesday. Callers get a typed `offline` outcome rather than an exception, so the UI can carry on
 * from IndexedDB instead of showing a child a stack trace.
 */

const BASE = import.meta.env.VITE_API_URL ?? '/api';

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; offline: true }
  | {
      ok: false;
      offline: false;
      status: number;
      errors?: Record<string, string[]>;
      message: string;
    };

/**
 * Set by the judge-mode switch to simulate losing the connection.
 *
 * A judge will not turn off their own wi-fi to test an offline claim, so the app has to be able to
 * cut itself off convincingly — every request fails exactly the way a dead network fails.
 */
let simulatedOffline = false;

export const setSimulatedOffline = (value: boolean): void => {
  simulatedOffline = value;
};

export const isSimulatedOffline = (): boolean => simulatedOffline;

export const isOnline = (): boolean => !simulatedOffline && navigator.onLine;

async function currentToken(): Promise<string | null> {
  const id = (await db.meta.get('active_profile'))?.value as number | undefined;
  if (id === undefined) return null;

  return (await db.profiles.get(id))?.token ?? null;
}

/**
 * Staff sign in on the same device as their students — a teacher scanning a class often does it on
 * a phone a child was holding a minute earlier — so their token is stored separately rather than
 * displacing the active student profile.
 */
export const teacherToken = async (): Promise<string | null> =>
  ((await db.meta.get('teacher_token'))?.value as string | undefined) ?? null;

export const setTeacherToken = (token: string | null): Promise<unknown> =>
  token === null
    ? db.meta.delete('teacher_token')
    : db.meta.put({ key: 'teacher_token', value: token });

export async function api<T>(
  path: string,
  init: RequestInit & { auth?: boolean; token?: string } = {},
): Promise<ApiResult<T>> {
  if (simulatedOffline) return { ok: false, offline: true };

  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');

  if (init.auth !== false) {
    const token = init.token ?? (await currentToken());
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  try {
    const response = await fetch(`${BASE}${path}`, { ...init, headers });

    if (response.ok) return { ok: true, data: (await response.json()) as T };

    const body = await response.json().catch(() => ({}));

    return {
      ok: false,
      offline: false,
      status: response.status,
      errors: body.errors,
      message: body.message ?? 'تعذّر إتمام الطلب.',
    };
  } catch {
    // fetch only rejects on a transport failure, which here means no network.
    return { ok: false, offline: true };
  }
}

export const get = <T>(path: string, token?: string): Promise<ApiResult<T>> =>
  api<T>(path, token === undefined ? {} : { token });

export const post = <T>(
  path: string,
  body?: unknown,
  options: { auth?: boolean; token?: string } = {},
): Promise<ApiResult<T>> =>
  api<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    ...options,
  });
