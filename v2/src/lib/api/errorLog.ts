import { SUPABASE_URL, SUPABASE_ANON_KEY, TABLES } from '@/lib/supabase';

/*
 * フロントのエラーを signage_error_logs に保存する。
 * RLS は is_active_member かつ user_id が本人か null のときだけ INSERT を通す（未ログインの失敗は保存されない）。
 *
 * supabase クライアントを使わず REST を直接呼ぶ: クライアントはトークン取得で auth のロックを取るため、
 * onAuthStateChange のコールバック内などから呼ばれると待ちになる。トークンとユーザーIDは保存済みセッションから同期的に読む。
 */

// ログ保存処理自身の出力はここへ流し、console.error フックの再入を防ぐ
const originalConsoleError = console.error.bind(console);

// 同じ失敗が文言を変えて繰り返されてもテーブルを埋めないよう、1ページあたりの送信件数に上限を設ける（全経路共通）
const MAX_ERROR_SENDS_PER_PAGE = 50;
let errorSendCount = 0;
// 画面遷移で中断された通信の失敗（Failed to fetch 等）は障害ではないため、離脱開始後は送らない
let pageUnloading = false;

interface ErrorLogPayload {
  context: string;
  message: string;
  stack?: string;
  userId: string | null;
}

/** supabase-js が localStorage に保存したセッション（既定のキー sb-<ref>-auth-token） */
function readStoredSession(): { access_token?: string; user?: { id?: string } } | null {
  try {
    const key = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// v1: js/error-handler.js getUserIdFromSession
export function getUserIdFromSession(): string | null {
  return readStoredSession()?.user?.id || null;
}

// Supabase の PostgrestError 等は Error を継承しないプレーンオブジェクトのことがあるため、code/details も含めて文字列化する
// v1: js/error-handler.js describeError
function describeError(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);
  const e = error as { message?: string; code?: string; details?: string; hint?: string };
  const extra = [e.code, e.details, e.hint].filter(Boolean).join(' / ');
  const message = e.message || safeStringify(error);
  return extra ? `${message} [${extra}]` : message;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// v1: js/error-handler.js saveErrorToSupabase
async function saveErrorLog(log: ErrorLogPayload): Promise<void> {
  if (pageUnloading || errorSendCount >= MAX_ERROR_SENDS_PER_PAGE) return;
  errorSendCount++;
  try {
    const accessToken = readStoredSession()?.access_token || SUPABASE_ANON_KEY;
    await fetch(`${SUPABASE_URL}/rest/v1/${TABLES.errorLogs}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Profile': 'signage',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        context: log.context || null,
        message: log.message || null,
        stack: log.stack || null,
        user_id: log.userId || null,
        user_agent: navigator.userAgent || null,
        url: window.location.href || null,
      }),
    });
  } catch {
    // エラーログ保存の失敗は無視（無限ループ防止）
  }
}

/** エラーをコンソールに出し、signage_error_logs に保存する（非同期。失敗してもアプリに影響しない） */
// v1: js/error-handler.js logError
export function logError(error: unknown, context = ''): void {
  const message = describeError(error);
  const stack =
    (error as { stack?: string } | null)?.stack ||
    (typeof error === 'object' ? safeStringify(error) : undefined);
  originalConsoleError('Error Log:', { context, message, stack });
  void saveErrorLog({ context, message, stack, userId: getUserIdFromSession() });
}

// 同じエラーの連続保存を抑える
const recentErrors = new Map<string, number>();
const ERROR_DEBOUNCE_MS = 5000;

// v1: js/error-handler.js isDuplicateError
function isDuplicateError(message: string): boolean {
  const now = Date.now();
  const lastTime = recentErrors.get(message);
  if (lastTime && now - lastTime < ERROR_DEBOUNCE_MS) return true;
  recentErrors.set(message, now);
  if (recentErrors.size > 50) {
    for (const [key, time] of recentErrors) {
      if (now - time >= ERROR_DEBOUNCE_MS) recentErrors.delete(key);
    }
  }
  return false;
}

let installed = false;

/**
 * 画面全体のエラーを保存する（window.onerror・未処理の Promise 拒否・Error を渡した console.error）。
 * アプリ起動時に1回だけ呼ぶ。
 */
// v1: js/error-handler.js のグローバル登録部分
export function installErrorLogging(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('pagehide', () => {
    pageUnloading = true;
  });

  window.addEventListener('error', (event) => {
    const msg = String(event.message || 'Unknown error');
    if (isDuplicateError(msg)) return;
    const err = event.error instanceof Error ? event.error : new Error(msg);
    if (!err.stack && event.filename) {
      err.stack = `${msg} at ${event.filename}:${event.lineno}:${event.colno}`;
    }
    logError(err, `global:${event.filename}:${event.lineno}`);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as { message?: string } | undefined;
    const msg = String(reason?.message || reason || 'Unhandled promise rejection');
    if (isDuplicateError(msg)) return;
    logError(reason instanceof Error ? reason : new Error(msg), 'unhandledrejection');
  });

  // catch 節で console.error(説明, error) としている失敗も保存する（Error または message を持つオブジェクトのときだけ）
  console.error = (...args: unknown[]) => {
    originalConsoleError(...args);
    const error = args.find(
      (a) =>
        a instanceof Error ||
        (!!a && typeof a === 'object' && typeof (a as { message?: unknown }).message === 'string'),
    );
    if (!error) return;
    const context =
      args
        .filter((a) => typeof a === 'string')
        .join(' ')
        .slice(0, 200) || 'console.error';
    const message = describeError(error);
    if (isDuplicateError(`${context}|${message}`)) return;
    void saveErrorLog({
      context,
      message,
      stack: (error as { stack?: string }).stack || safeStringify(error),
      userId: getUserIdFromSession(),
    });
  };
}
