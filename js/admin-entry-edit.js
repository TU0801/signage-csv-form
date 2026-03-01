// admin-entry-edit.js - エントリ編集モーダル

import { updateEntry } from './supabase-client.js';
import { showToast } from './ui-utils.js';
import { getAppSettings } from './admin-settings.js';

let getState = null;
let getCallbacks = null;

/**
 * エントリ編集モジュール初期化
 * @param {Function} _getState - () => { pendingEntries, entries, masterData }
 * @param {Function} _getCallbacks - () => { loadPendingEntries, loadEntries, renderPendingEntries, renderEntries }
 */
export function initEntryEditModule(_getState, _getCallbacks) {
    getState = _getState;
    getCallbacks = _getCallbacks;
}

/**
 * エントリ編集モーダルを開く
 * @param {string} id - エントリID
 * @param {string} mode - 'pending' or 'approved'
 */
export async function editEntry(id, mode) {
    const { pendingEntries, entries, masterData } = getState();
    const entry = mode === 'pending'
        ? pendingEntries.find(e => e.id === id)
        : entries.find(e => e.id === id);

    if (!entry) {
        showToast('エントリが見つかりません', 'error');
        return;
    }

    // 編集モーダルを作成
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'editEntryModal';
    modal.style.cssText = 'display: flex; align-items: center; justify-content: center; background: rgba(15, 23, 42, 0.8); z-index: 10000; backdrop-filter: blur(4px);';
    modal.innerHTML = `
        <div style="
            max-width: 550px;
            width: 90%;
            background: white;
            border-radius: 16px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4);
            overflow: hidden;
        ">
            <div style="
                padding: 1.5rem 2rem;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <h3 style="margin: 0; font-size: 1.25rem; font-weight: 700;">✏️ 表示設定を編集</h3>
                <button onclick="closeEditModal()" style="
                    background: rgba(255,255,255,0.2);
                    border: none;
                    color: white;
                    font-size: 1.5rem;
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.2s;
                " onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.2)'">&times;</button>
            </div>
            <div style="padding: 2rem;">
                <!-- 基本情報（読み取り専用） -->
                <div style="background: #f1f5f9; border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
                    <h4 style="margin: 0 0 0.75rem; font-size: 0.875rem; font-weight: 700; color: #64748b;">📋 基本情報（参照のみ）</h4>
                    <div style="display: grid; grid-template-columns: 1fr; gap: 0.75rem; font-size: 0.875rem;">
                        <div style="display: flex; gap: 0.5rem;">
                            <span style="color: #64748b; flex-shrink: 0;">物件：</span>
                            <span style="font-weight: 600; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${entry.property_code || '-'} ${masterData.properties.find(p => p.property_code === entry.property_code)?.property_name || ''}">${entry.property_code || '-'} ${masterData.properties.find(p => p.property_code === entry.property_code)?.property_name || ''}</span>
                        </div>
                        <div style="display: flex; gap: 0.5rem;">
                            <span style="color: #64748b; flex-shrink: 0;">端末：</span>
                            <span style="font-weight: 600; color: #1e293b;">${entry.terminal_id || '-'}</span>
                        </div>
                        <div style="display: flex; gap: 0.5rem;">
                            <span style="color: #64748b; flex-shrink: 0;">保守会社：</span>
                            <span style="font-weight: 600; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${entry.vendor_name || '-'}">${entry.vendor_name || '-'}</span>
                        </div>
                        <div style="display: flex; gap: 0.5rem;">
                            <span style="color: #64748b; flex-shrink: 0;">点検種別：</span>
                            <span style="font-weight: 600; color: #1e293b;">${entry.inspection_type || '-'}</span>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                            <div><span style="color: #64748b;">点検開始：</span><span style="font-weight: 600; color: #1e293b;">${entry.inspection_start || '-'}</span></div>
                            <div><span style="color: #64748b;">点検終了：</span><span style="font-weight: 600; color: #1e293b;">${entry.inspection_end || '-'}</span></div>
                        </div>
                    </div>
                </div>

                <!-- 表示設定（編集可能） -->
                <h4 style="margin: 0 0 1rem; font-size: 0.875rem; font-weight: 700; color: #1e293b;">⚙️ 表示設定</h4>
                <form id="editEntryForm">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 600; color: #475569;">表示開始日</label>
                            <input type="date" id="editDisplayStartDate" value="${entry.display_start_date || ''}" style="
                                width: 100%;
                                padding: 0.625rem 0.875rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                font-size: 0.9375rem;
                                transition: all 0.2s;
                                background: #f8fafc;
                            " onfocus="this.style.borderColor='#667eea'; this.style.background='white'" onblur="this.style.borderColor='#e2e8f0'; this.style.background='#f8fafc'">
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 600; color: #475569;">表示開始時間</label>
                            <input type="time" id="editDisplayStartTime" value="${entry.display_start_time || ''}" style="
                                width: 100%;
                                padding: 0.625rem 0.875rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                font-size: 0.9375rem;
                                transition: all 0.2s;
                                background: #f8fafc;
                            " onfocus="this.style.borderColor='#667eea'; this.style.background='white'" onblur="this.style.borderColor='#e2e8f0'; this.style.background='#f8fafc'">
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 600; color: #475569;">表示終了日</label>
                            <input type="date" id="editDisplayEndDate" value="${entry.display_end_date || ''}" style="
                                width: 100%;
                                padding: 0.625rem 0.875rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                font-size: 0.9375rem;
                                transition: all 0.2s;
                                background: #f8fafc;
                            " onfocus="this.style.borderColor='#667eea'; this.style.background='white'" onblur="this.style.borderColor='#e2e8f0'; this.style.background='#f8fafc'">
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 600; color: #475569;">表示終了時間</label>
                            <input type="time" id="editDisplayEndTime" value="${entry.display_end_time || ''}" style="
                                width: 100%;
                                padding: 0.625rem 0.875rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                font-size: 0.9375rem;
                                transition: all 0.2s;
                                background: #f8fafc;
                            " onfocus="this.style.borderColor='#667eea'; this.style.background='white'" onblur="this.style.borderColor='#e2e8f0'; this.style.background='#f8fafc'">
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 600; color: #475569;">表示時間（秒）</label>
                            <input type="number" id="editDisplayDuration" value="${entry.display_duration || getAppSettings().display_time_default || 6}" min="1" max="60" style="
                                width: 100%;
                                padding: 0.625rem 0.875rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                font-size: 0.9375rem;
                                transition: all 0.2s;
                                background: #f8fafc;
                            " onfocus="this.style.borderColor='#667eea'; this.style.background='white'" onblur="this.style.borderColor='#e2e8f0'; this.style.background='#f8fafc'">
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 600; color: #475569;">表示位置</label>
                            <select id="editPosterPosition" style="
                                width: 100%;
                                padding: 0.625rem 0.875rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                font-size: 0.9375rem;
                                transition: all 0.2s;
                                background: #f8fafc;
                                cursor: pointer;
                            " onfocus="this.style.borderColor='#667eea'; this.style.background='white'" onblur="this.style.borderColor='#e2e8f0'; this.style.background='#f8fafc'">
                                <option value="1" ${entry.poster_position === '1' ? 'selected' : ''}>①上左</option>
                                <option value="2" ${entry.poster_position === '2' ? 'selected' : ''}>②上中</option>
                                <option value="3" ${entry.poster_position === '3' ? 'selected' : ''}>③上右</option>
                                <option value="4" ${entry.poster_position === '4' || !entry.poster_position ? 'selected' : ''}>④中央</option>
                                <option value="0" ${entry.poster_position === '0' ? 'selected' : ''}>⑤全体</option>
                            </select>
                        </div>
                    </div>
                </form>
            </div>
            <div style="
                padding: 1.25rem 2rem;
                background: #f8fafc;
                border-top: 1px solid #e2e8f0;
                display: flex;
                gap: 0.75rem;
                justify-content: flex-end;
            ">
                <button onclick="closeEditModal()" style="
                    padding: 0.625rem 1.5rem;
                    border: 2px solid #cbd5e1;
                    background: white;
                    color: #475569;
                    border-radius: 8px;
                    font-weight: 600;
                    font-size: 0.9375rem;
                    cursor: pointer;
                    transition: all 0.2s;
                " onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='white'">キャンセル</button>
                <button onclick="saveEditedEntry('${id}', '${mode}')" style="
                    padding: 0.625rem 2rem;
                    border: none;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border-radius: 8px;
                    font-weight: 700;
                    font-size: 0.9375rem;
                    cursor: pointer;
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
                    transition: all 0.2s;
                " onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 6px 16px rgba(102, 126, 234, 0.5)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(102, 126, 234, 0.4)'">💾 保存</button>
            </div>
        </div>
    `;

    // 既存のモーダルがあれば削除
    const existingModal = document.getElementById('editEntryModal');
    if (existingModal) {
        existingModal.remove();
    }

    document.body.appendChild(modal);
    modal.classList.add('active');

    // 背景クリックで閉じる
    modal.addEventListener('click', (e) => {
        if (e.target.id === 'editEntryModal') {
            closeEditModal();
        }
    });
}

/**
 * 編集モーダルを閉じる
 */
export function closeEditModal() {
    const modal = document.getElementById('editEntryModal');
    if (modal) {
        modal.remove();
    }
}

/**
 * 編集内容を保存
 * @param {string} id - エントリID
 * @param {string} mode - 'pending' or 'approved'
 */
export async function saveEditedEntry(id, mode) {
    const { entries } = getState();
    const { loadPendingEntries, loadEntries, renderPendingEntries, renderEntries } = getCallbacks();

    const updatedEntry = {
        display_start_date: document.getElementById('editDisplayStartDate').value || null,
        display_start_time: document.getElementById('editDisplayStartTime').value || null,
        display_end_date: document.getElementById('editDisplayEndDate').value || null,
        display_end_time: document.getElementById('editDisplayEndTime').value || null,
        display_duration: parseInt(document.getElementById('editDisplayDuration').value) || getAppSettings().display_time_default || 6,
        poster_position: document.getElementById('editPosterPosition').value || '4'
    };

    // ステータス判定
    if (mode === 'pending') {
        updatedEntry.status = 'ready'; // 承認待ち編集 → 即承認
    } else {
        // データ一覧からの編集の場合、元のstatusを確認
        const entry = entries.find(e => e.id === id);
        if (entry?.status === 'exported') {
            updatedEntry.status = 'ready'; // 取込済み編集 → 未取込に戻す
        }
    }

    try {
        await updateEntry(id, updatedEntry);
        showToast('編集しました', 'success');
        closeEditModal();
        await loadPendingEntries();
        await loadEntries();
        renderPendingEntries();
        renderEntries();
    } catch (error) {
        console.error('Failed to update entry:', error);
        showToast('編集に失敗しました: ' + error.message, 'error');
    }
}
