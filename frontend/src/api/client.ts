// HTTP-клиент: добавляет токен, обновляет его при истечении и приводит ошибки к одному виду.

import type { TokenPair } from "./types";

const BASE = "/api/v1";
const ACCESS_KEY = "st_access";
const REFRESH_KEY = "st_refresh";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: { field: string; message: string }[];

  constructor(status: number, code: string, message: string, details?: { field: string; message: string }[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  save(pair: TokenPair) {
    localStorage.setItem(ACCESS_KEY, pair.access_token);
    localStorage.setItem(REFRESH_KEY, pair.refresh_token);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const refresh = tokens.refresh;
  if (!refresh) return false;
  if (!refreshing) {
    refreshing = fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    })
      .then(async (res) => {
        if (!res.ok) return false;
        tokens.save((await res.json()) as TokenPair);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

type Query = Record<string, string | number | boolean | (string | number)[] | null | undefined>;

export function buildQuery(params?: Query): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    if (Array.isArray(value)) value.forEach((v) => search.append(key, String(v)));
    else search.append(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export async function request<T>(
  method: string,
  path: string,
  options: { body?: unknown; query?: Query; auth?: boolean } = {},
  retried = false,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.auth !== false && tokens.access) headers.Authorization = `Bearer ${tokens.access}`;

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}${buildQuery(options.query)}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "network_error", "Нет связи с сервером. Проверьте подключение и повторите.");
  }

  if (response.status === 401 && options.auth !== false && !retried) {
    if (await refreshTokens()) return request<T>(method, path, options, true);
    tokens.clear();
    onUnauthorized();
  }

  if (!response.ok) {
    let code = "http_error";
    let message = `Ошибка сервера (${response.status})`;
    let details: { field: string; message: string }[] | undefined;
    try {
      const data = await response.json();
      code = data.code ?? code;
      message = data.message ?? message;
      details = data.details;
    } catch {
      /* тело ответа не JSON */
    }
    if (response.status >= 500) message = "Сервер временно недоступен. Данные формы сохранены — попробуйте ещё раз.";
    throw new ApiError(response.status, code, message, details);
  }
  if (response.status === 204 || response.status === 202) {
    return (response.status === 202 ? await response.json() : undefined) as T;
  }
  return (await response.json()) as T;
}

export const http = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path, { query }),
  post: <T>(path: string, body?: unknown, query?: Query) => request<T>("POST", path, { body, query }),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, { body }),
  del: <T = void>(path: string, query?: Query) => request<T>("DELETE", path, { query }),
};
