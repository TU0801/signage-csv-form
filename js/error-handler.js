// error-handler.js - 統一エラーハンドリング

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

// 統一エラーハンドラー
export function handleError(error, context = '', customMessage = null) {
    console.error(`Error in ${context}:`, error);

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

// エラーロギング（将来的にSupabaseに保存可能）
export function logError(error, context = '', userId = null) {
    const errorLog = {
        timestamp: new Date().toISOString(),
        context,
        message: error.message || error.toString(),
        stack: error.stack,
        userId,
        userAgent: navigator.userAgent,
        url: window.location.href
    };

    console.error('Error Log:', errorLog);

    // 将来的な拡張: Supabaseにログ保存
    // await supabase.from('error_logs').insert(errorLog);
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.handleError = handleError;
    window.handleSuccess = handleSuccess;
    window.logError = logError;
}
