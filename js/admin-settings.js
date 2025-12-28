// admin-settings.js - 設定管理

import { getSettings, updateSettings } from './supabase-client.js';

// ========================================
// 設定管理
// ========================================

let appSettings = {};

export function getAppSettings() {
    return appSettings;
}

export async function loadAppSettings() {
    try {
        const settings = await getSettings();
        appSettings = {};
        settings?.forEach(s => {
            appSettings[s.setting_key] = s.setting_value;
        });

        // フォームに反映
        const displayTimeMax = document.getElementById('settingDisplayTimeMax');
        const remarksCharsPerLine = document.getElementById('settingRemarksCharsPerLine');
        const remarksMaxLines = document.getElementById('settingRemarksMaxLines');
        const noticeTextMaxChars = document.getElementById('settingNoticeTextMaxChars');

        if (displayTimeMax) displayTimeMax.value = appSettings.display_time_max || 30;
        if (remarksCharsPerLine) remarksCharsPerLine.value = appSettings.remarks_chars_per_line || 25;
        if (remarksMaxLines) remarksMaxLines.value = appSettings.remarks_max_lines || 5;
        if (noticeTextMaxChars) noticeTextMaxChars.value = appSettings.notice_text_max_chars || 200;

        return appSettings;
    } catch (error) {
        console.error('Failed to load settings:', error);
        return appSettings;
    }
}

export async function saveSettings(showToast) {
    try {
        const settings = {
            display_time_max: document.getElementById('settingDisplayTimeMax').value,
            remarks_chars_per_line: document.getElementById('settingRemarksCharsPerLine').value,
            remarks_max_lines: document.getElementById('settingRemarksMaxLines').value,
            notice_text_max_chars: document.getElementById('settingNoticeTextMaxChars').value
        };

        await updateSettings(settings);
        Object.assign(appSettings, settings);
        showToast('設定を保存しました', 'success');
        return true;
    } catch (error) {
        console.error('Failed to save settings:', error);
        showToast('設定の保存に失敗しました', 'error');
        return false;
    }
}
