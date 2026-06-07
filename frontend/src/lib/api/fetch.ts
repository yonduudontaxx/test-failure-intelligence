const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function buildQuery(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    qs.set(key, String(value));
  }
  const serialized = qs.toString();
  return serialized ? `?${serialized}` : '';
}

async function unwrap<T>(res: Response): Promise<T> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiError('UNKNOWN_ERROR', res.status, 'Unexpected error');
  }

  if (isObject(body)) {
    if ('data' in body) {
      return (body as { data: T }).data;
    }
    if ('error' in body && isObject(body.error)) {
      const { code, message } = body.error;
      if (typeof code === 'string' && typeof message === 'string') {
        throw new ApiError(code, res.status, message);
      }
    }
  }

  throw new ApiError('UNKNOWN_ERROR', res.status, 'Unexpected error');
}

export async function apiGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const url = `${API_BASE_URL}${path}${buildQuery(params)}`;
  const res = await fetch(url, { cache: 'no-store' });
  return unwrap<T>(res);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  return unwrap<T>(res);
}
