import type { ErrorEnvelope, SuccessEnvelope } from './types';

/**
 * 게이트웨이 공통 요청기.
 *
 * 성공하면 봉투를 벗겨 `data` 만 돌려주고, 실패는 전부 `ApiError` 로 모은다.
 * 화면은 절대 이 함수를 직접 부르지 않는다 — 엔드포인트별 함수를 거친다.
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '');
const PREFIX = normalisePrefix(import.meta.env.VITE_API_PREFIX ?? '/api/v1');

/**
 * 아이 화면에 그대로 띄우는 문구.
 *
 * 어떤 에러도 "오류"나 코드로 보여주지 않는다. 아이는 무엇이 잘못됐는지 알 수 없고,
 * 알아도 고칠 수 없다. 다시 해보자고만 말한다.
 */
export const CHILD_FALLBACK = '괜찮아, 다시 해볼까?';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  /** 아이에게 보여줄 문구. 개발자용 message 와 분리한다. */
  readonly childMessage = CHILD_FALLBACK;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

function normalisePrefix(raw: string): string {
  const prefix = raw.trim().replace(/\/$/, '');
  if (!prefix) return '';
  return prefix.startsWith('/') ? prefix : `/${prefix}`;
}

type RequestOptions = {
  /** 밀리초. 동화만 60초, 나머지는 15초다 — 게이트웨이 타임아웃과 맞춘다. */
  timeoutMs: number;
  signal?: AbortSignal;
};

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  init: { body?: BodyInit; headers?: HeadersInit },
  { timeoutMs, signal }: RequestOptions,
): Promise<T> {
  if (!BASE_URL) {
    throw new ApiError('CONFIGURATION_ERROR', 0, 'VITE_API_BASE_URL 이 비어 있습니다.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const response = await fetch(`${BASE_URL}${PREFIX}${path}`, {
      method,
      body: init.body,
      headers: init.headers,
      signal: controller.signal,
    });

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const envelope = payload as ErrorEnvelope | null;
      throw new ApiError(
        envelope?.error?.code ?? 'AI_SERVER_ERROR',
        response.status,
        envelope?.error?.message ?? `HTTP ${response.status}`,
      );
    }
    if (!isSuccess(payload)) {
      throw new ApiError('INVALID_RESPONSE', response.status, '응답에 success/data 가 없습니다.');
    }
    return payload.data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      // 화면을 떠나서 끊은 것과 서버가 늦어서 끊긴 것은 다르게 다뤄야 한다 —
      // 앞은 조용히 무시하고, 뒤는 "다시 해볼까?" 를 띄운다.
      if (signal?.aborted) throw new ApiError('CANCELLED', 0, '요청이 취소됐습니다.');
      throw new ApiError('TIMEOUT', 504, `${timeoutMs}ms 안에 끝나지 않았습니다.`);
    }
    throw new ApiError(
      'NETWORK_ERROR',
      0,
      error instanceof Error ? error.message : '네트워크 요청 실패',
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

function isSuccess(payload: unknown): payload is SuccessEnvelope<unknown> {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as { success?: unknown }).success === true &&
    (payload as { data?: unknown }).data !== undefined &&
    (payload as { data?: unknown }).data !== null
  );
}

export function getJson<T>(path: string, options: RequestOptions): Promise<T> {
  return request<T>('GET', path, {}, options);
}

export function postJson<T>(path: string, body: unknown, options: RequestOptions): Promise<T> {
  return request<T>(
    'POST',
    path,
    { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } },
    options,
  );
}

export function postForm<T>(path: string, body: FormData, options: RequestOptions): Promise<T> {
  // Content-Type 을 직접 넣지 않는다 — boundary 는 브라우저가 만들어야 한다.
  return request<T>('POST', path, { body }, options);
}
