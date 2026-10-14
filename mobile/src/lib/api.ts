import i18n from '@/i18n';

// The ONE place that talks to the server. Screens never call fetch() directly: they call apiRequest().

// Public address of the backend. Not a secret (the website uses the same one).
// EXPO_PUBLIC_* variables are copied into the app at build time; see .env.example to point at another server.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://finot-api.onrender.com';

// The free server sleeps and can need about a minute to wake up, so we wait longer than usual.
const TIMEOUT_MS = 70_000;

// A request that failed. `status` is the HTTP code (0 = could not reach the server at all).
export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown; // turned into JSON for us
  token?: string | null; // the access key, when the call needs a signed-in user
};

// <T> is the type of the answer we expect: apiRequest<HealthResponse>('/health/') returns a HealthResponse.
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = options;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    // The server answers some messages (sign-up emails, account errors) in the user's language.
    'Accept-Language': i18n.language,
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `JWT ${token}`; // this backend uses the word JWT, not Bearer
  }

  // Give up after TIMEOUT_MS instead of waiting forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, i18n.t('m_err_network'));
  } finally {
    clearTimeout(timer);
  }

  // Read the answer as text first: some answers (204) have no body, and an error page is not JSON.
  const text = await response.text();
  let data: unknown = null;
  if (text !== '') {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, errorMessage(response.status, data), data);
  }
  return data as T;
}

// Turn the server's error answer into one sentence a person can read.
function errorMessage(status: number, data: unknown): string {
  if (data && typeof data === 'object') {
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === 'string') {
      return detail;
    }
  }
  if (status === 401) return i18n.t('m_err_401');
  if (status === 403) return i18n.t('m_err_403');
  if (status === 404) return i18n.t('m_err_404');
  if (status === 429) return i18n.t('m_err_429');
  if (status >= 500) return i18n.t('m_err_500');
  return i18n.t('m_err_generic', { status });
}
