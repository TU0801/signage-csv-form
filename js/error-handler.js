// error-handler.js - 統一エラーハンドリング

// 下の console.error フックより前の本来の出力先。ログ保存処理自身の出力はここへ流し、フックの再入を防ぐ
const originalConsoleError = console.error.bind(console);

// 英語エラーを日本語に変換
function translateError(errorMessage) {
    const translations = {
        'duplicate key': 'すでに登録されています',
        'unique constraint': 'すでに登録されています',
        'foreign key': '関連データが存在しません',
        'not found': 'データが見つかりません',
        'permission denied': '権限がありません',
        'authentication': '認証エラーです',
        'network': 'ネットワークエラーです',
        'timeout': 'タイムアウトしました',
        'invalid': '入力値が不正です',
        'required': '必須項目が入力されていません'
    };

    const message = String(errorMessage || '').toLowerCase();

    for (const [en, ja] of Object.entries(translations)) {
        if (message.includes(en)) {
            return ja;
        }
    }

    return '操作に失敗しました';
}

// セッションからユーザーIDを同期的に取得（非同期APIを避ける）
function getUserIdFromSession() {
    try {
        const url = window.SUPABASE_URL;
        if (!url) return null;
        const key = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
        const sessionStr = localStorage.getItem(key);
        if (!sessionStr) return null;
        const session = JSON.parse(sessionStr);
        return session?.user?.id || null;
    } catch (_e) {
        return null;
    }
}

// 統一エラーハンドラー
export function handleError(error, context = '', customMessage = null) {
    // console 出力と Supabase への保存（ユーザーIDは認証トークンから推定）
    logError(error, context, getUserIdFromSession());

    // カスタムメッセージが指定されている場合はそれを使用
    if (customMessage) {
        if (window.showToast) {
            window.showToast(customMessage, 'error');
        } else {
            alert(customMessage);
        }
        return;
    }

    // エラーメッセージを翻訳
    const message = translateError(error.message || error.toString());

    // トースト表示（利用可能な場合）
    if (window.showToast) {
        window.showToast(message, 'error');
    } else {
        alert(message);
    }
}

// 成功メッセージの統一ハンドラー
export function handleSuccess(message, context = '') {
    console.log(`Success in ${context}:`, message);

    if (window.showToast) {
        window.showToast(message, 'success');
    } else {
        alert(message);
    }
}

// Supabase の PostgrestError 等は Error を継承しないプレーンオブジェクトのことがあるため、code/details も含めて文字列化する
function describeError(error) {
    if (!error || typeof error !== 'object') return String(error);
    const extra = [error.code, error.details, error.hint].filter(Boolean).join(' / ');
    const message = error.message || safeStringify(error);
    return extra ? `${message} [${extra}]` : message;
}

function safeStringify(value) {
    try {
        return JSON.stringify(value);
    } catch (_e) {
        return String(value);
    }
}

// エラーロギング（Supabaseに保存）
export function logError(error, context = '', userId = null) {
    const errorLog = {
        timestamp: new Date().toISOString(),
        context,
        message: describeError(error),
        stack: error.stack || (typeof error === 'object' ? safeStringify(error) : undefined),
        userId,
        userAgent: navigator.userAgent,
        url: window.location.href
    };

    originalConsoleError('Error Log:', errorLog);

    // Supabaseにログ保存（非同期、失敗してもアプリに影響なし）
    saveErrorToSupabase(errorLog);
}

// Supabaseにエラーログを保存（REST API直接呼び出し）
async function saveErrorToSupabase(errorLog) {
    try {
        const url = window.SUPABASE_URL;
        const key = window.SUPABASE_ANON_KEY;
        if (!url || !key) return;

        // 認証トークンを取得（ログイン中の場合）
        let accessToken = key;
        try {
            const sessionStr = localStorage.getItem(`sb-${new URL(url).hostname.split('.')[0]}-auth-token`);
            if (sessionStr) {
                const session = JSON.parse(sessionStr);
                if (session.access_token) {
                    accessToken = session.access_token;
                }
            }
        } catch (_e) {
            // セッション取得失敗時はanon keyで続行
        }

        await fetch(`${url}/rest/v1/signage_error_logs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Profile': 'signage',
                'apikey': key,
                'Authorization': `Bearer ${accessToken}`,
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                context: errorLog.context || null,
                message: errorLog.message || null,
                stack: errorLog.stack || null,
                user_id: errorLog.userId || null,
                user_agent: errorLog.userAgent || null,
                url: errorLog.url || null
            })
        });
    } catch (_e) {
        // エラーログ保存の失敗は無視（無限ループ防止）
    }
}

// グローバルエラーキャッチ（重複防止付き）
const _recentErrors = new Map();
const ERROR_DEBOUNCE_MS = 5000;

function isDuplicateError(message) {
    const now = Date.now();
    const lastTime = _recentErrors.get(message);
    if (lastTime && (now - lastTime) < ERROR_DEBOUNCE_MS) {
        return true;
    }
    _recentErrors.set(message, now);
    // 古いエントリを定期的にクリーンアップ
    if (_recentErrors.size > 50) {
        for (const [key, time] of _recentErrors) {
            if ((now - time) >= ERROR_DEBOUNCE_MS) {
                _recentErrors.delete(key);
            }
        }
    }
    return false;
}

// window.onerror: グローバルJSエラー捕捉
if (typeof window !== 'undefined') {
    window.onerror = function (message, source, lineno, colno, error) {
        const msg = String(message || 'Unknown error');
        if (isDuplicateError(msg)) return;
        const err = error || new Error(msg);
        if (!err.stack && source) {
            err.stack = `${msg} at ${source}:${lineno}:${colno}`;
        }
        logError(err, `global:${source}:${lineno}`, getUserIdFromSession());
    };

    // unhandledrejection: 未処理Promise拒否捕捉
    window.addEventListener('unhandledrejection', function (event) {
        const reason = event.reason;
        const msg = String(reason?.message || reason || 'Unhandled promise rejection');
        if (isDuplicateError(msg)) return;
        const err = reason instanceof Error ? reason : new Error(msg);
        logError(err, 'unhandledrejection', getUserIdFromSession());
    });

    // 各画面の catch 節は console.error(説明, error) + トーストで失敗を扱っているため、
    // console.error に Error（または message を持つエラーオブジェクト）が渡されたら保存する
    console.error = function (...args) {
        originalConsoleError(...args);
        const error = args.find(a => a instanceof Error || (a && typeof a === 'object' && typeof a.message === 'string'));
        if (!error) return;
        const context = args.filter(a => typeof a === 'string').join(' ').slice(0, 200) || 'console.error';
        const message = describeError(error);
        if (isDuplicateError(`${context}|${message}`)) return;
        saveErrorToSupabase({
            context,
            message,
            stack: error.stack || safeStringify(error),
            userId: getUserIdFromSession(),
            userAgent: navigator.userAgent,
            url: window.location.href
        });
    };
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.handleError = handleError;
    window.handleSuccess = handleSuccess;
    window.logError = logError;
}
