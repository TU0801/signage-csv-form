// admin.js - 管理者画面のエントリーポイント

import {
    getUser,
    getProfile,
    isAdmin,
    signOut,
    getAllMasterData,
    getAllEntries,
    getAllProfiles,
    updateProfileRole,
    createUser,
    deleteEntry,
    getPendingEntries,
    approveEntry,
    approveEntries,
    rejectEntry
} from './supabase-client.js';

import {
    loadMasterData,
    renderProperties,
    renderVendors,
    renderInspections,
    renderCategories,
    openMasterModal,
    closeMasterModal,
    handleMasterFormSubmit,
    deleteMasterPropertyAction,
    deleteMasterVendorAction,
    deleteMasterInspectionAction,
    deleteMasterCategoryAction
} from './admin-masters.js';

import {
    loadAppSettings,
    saveSettings
} from './admin-settings.js';

// ========================================
// セキュリティ: HTMLエスケープ
// ========================================

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ========================================
// グローバル変数
// ========================================

let masterData = { properties: [], vendors: [], inspectionTypes: [], categories: [] };
let entries = [];
let profiles = [];
let pendingEntries = [];
let selectedPendingIds = [];

// ユーザーIDからメールアドレスを取得
function getUserEmail(userId) {
    if (!userId) return '-';
    const profile = profiles.find(p => p.id === userId);
    return profile?.email || '-';
}

// ========================================
// 初期化
// ========================================

async function init() {
    // 認証チェック
    const user = await getUser();
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    // 管理者チェック
    const admin = await isAdmin();
    if (!admin) {
        alert('管理者権限が必要です');
        window.location.href = 'index.html';
        return;
    }

    // ユーザー情報表示
    const profile = await getProfile();
    document.getElementById('userEmail').textContent = profile?.email || user.email;

    // ログアウトボタン
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await signOut();
        window.location.href = 'login.html';
    });

    // データ読み込み
    await loadAllData();

    // イベントリスナー設定
    setupEventListeners();

    // 初期表示
    updateStats();
    populateFilters();
    loadPendingEntries();
    loadEntries();
    loadMasterData(masterData);
    loadUsers();
    loadAppSettings();
}

async function loadAllData() {
    const errors = [];

    // マスターデータを取得
    try {
        masterData = await getAllMasterData();
    } catch (error) {
        console.error('Failed to load master data:', error);
        errors.push('マスターデータ');
    }

    // エントリを取得
    try {
        entries = await getAllEntries();
    } catch (error) {
        console.error('Failed to load entries:', error);
        errors.push('エントリ');
    }

    // プロファイルを取得
    try {
        profiles = await getAllProfiles();
    } catch (error) {
        console.error('Failed to load profiles:', error);
        errors.push('ユーザー');
    }

    // 承認待ちを取得
    try {
        pendingEntries = await getPendingEntries();
    } catch (error) {
        console.error('Failed to load pending entries:', error);
        errors.push('承認待ち');
    }

    // エラーがあった場合のみトーストを表示
    if (errors.length > 0) {
        showToast(`一部データの取得に失敗しました: ${errors.join(', ')}`, 'error');
    }
}

// ========================================
// イベントリスナー
// ========================================

function setupEventListeners() {
    // タブ切り替え
    document.querySelectorAll('.admin-tab[data-tab]').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab[data-tab]').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
        });
    });

    // マスタータブ切り替え
    document.querySelectorAll('.admin-tab[data-master]').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab[data-master]').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.master-content').forEach(c => c.style.display = 'none');
            tab.classList.add('active');
            document.getElementById(`master-${tab.dataset.master}`).style.display = 'block';
        });
    });

    // 検索
    document.getElementById('searchBtn').addEventListener('click', loadEntries);

    // CSVエクスポート
    document.getElementById('exportCsvBtn').addEventListener('click', exportCSV);
    document.getElementById('exportCopyBtn').addEventListener('click', copyCSV);

    // マスター追加ボタン
    document.getElementById('addPropertyBtn').addEventListener('click', () => openMasterModal('property', masterData));
    document.getElementById('addVendorBtn').addEventListener('click', () => openMasterModal('vendor', masterData));
    document.getElementById('addInspectionBtn').addEventListener('click', () => openMasterModal('inspection', masterData));
    document.getElementById('addCategoryBtn')?.addEventListener('click', () => openMasterModal('category', masterData));

    // マスター検索
    document.getElementById('propertySearch')?.addEventListener('input', (e) => {
        renderProperties(masterData, e.target.value);
    });
    document.getElementById('vendorSearch')?.addEventListener('input', (e) => {
        renderVendors(masterData, e.target.value);
    });
    document.getElementById('inspectionSearch')?.addEventListener('input', (e) => {
        renderInspections(masterData, e.target.value);
    });
    document.getElementById('categorySearch')?.addEventListener('input', (e) => {
        renderCategories(masterData, e.target.value);
    });

    // 設定保存ボタン
    document.getElementById('saveSettingsBtn')?.addEventListener('click', () => saveSettings(showToast));

    // マスターフォーム送信
    document.getElementById('masterForm').addEventListener('submit', (e) => {
        handleMasterFormSubmit(e, masterData, showToast, updateStats);
    });

    // モーダル外クリックで閉じる
    document.getElementById('masterModal').addEventListener('click', (e) => {
        if (e.target.id === 'masterModal') closeMasterModal();
    });

    // 承認関連
    document.getElementById('selectAllPending').addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('#pendingBody input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = e.target.checked);
        updateSelectedPending();
    });

    document.getElementById('approveAllBtn').addEventListener('click', approveSelected);

    // ユーザー追加
    document.getElementById('addUserBtn')?.addEventListener('click', openUserModal);
    document.getElementById('userForm')?.addEventListener('submit', handleUserFormSubmit);
    document.getElementById('userModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'userModal') closeUserModal();
    });
}

// ========================================
// 統計
// ========================================

function updateStats() {
    document.getElementById('statTotal').textContent = entries.length;

    // 今月の登録数
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEntries = entries.filter(e => new Date(e.created_at) >= monthStart);
    document.getElementById('statMonth').textContent = monthEntries.length;

    document.getElementById('statUsers').textContent = profiles.length;
    document.getElementById('statProperties').textContent = masterData.properties.length;
}

// ========================================
// 承認待ち
// ========================================

async function loadPendingEntries() {
    try {
        pendingEntries = await getPendingEntries();
        renderPendingEntries();
        document.getElementById('pendingCount').textContent = pendingEntries.length;
    } catch (error) {
        console.error('Failed to load pending entries:', error);
    }
}

function renderPendingEntries() {
    const tbody = document.getElementById('pendingBody');
    const emptyMsg = document.getElementById('pendingEmpty');

    tbody.innerHTML = '';
    selectedPendingIds = [];
    document.getElementById('selectAllPending').checked = false;
    document.getElementById('approveAllBtn').disabled = true;

    if (pendingEntries.length === 0) {
        emptyMsg.style.display = 'block';
        return;
    }

    emptyMsg.style.display = 'none';

    pendingEntries.forEach(entry => {
        const tr = document.createElement('tr');
        const createdAt = new Date(entry.created_at).toLocaleString('ja-JP');
        const startDate = entry.start_date
            ? new Date(entry.start_date).toLocaleDateString('ja-JP')
            : '-';

        tr.innerHTML = `
            <td><input type="checkbox" data-id="${escapeHtml(entry.id)}" onchange="updateSelectedPending()"></td>
            <td>${escapeHtml(getUserEmail(entry.user_id))}</td>
            <td>${escapeHtml(entry.property_code)}</td>
            <td>${escapeHtml(entry.inspection_type)}</td>
            <td>${escapeHtml(startDate)}</td>
            <td>${escapeHtml(createdAt)}</td>
            <td>
                <button class="btn btn-outline btn-sm" data-action="detail" data-id="${escapeHtml(entry.id)}">📋</button>
                <button class="btn btn-success btn-sm" data-action="approve" data-id="${escapeHtml(entry.id)}">✅</button>
                <button class="btn btn-outline btn-sm" data-action="reject" data-id="${escapeHtml(entry.id)}">❌</button>
            </td>
        `;
        tr.querySelector('[data-action="detail"]').addEventListener('click', () => showEntryDetail(entry));
        tr.querySelector('[data-action="approve"]').addEventListener('click', () => approveSingle(entry.id));
        tr.querySelector('[data-action="reject"]').addEventListener('click', () => rejectSingle(entry.id));
        tbody.appendChild(tr);
    });
}

function updateSelectedPending() {
    const checkboxes = document.querySelectorAll('#pendingBody input[type="checkbox"]');
    selectedPendingIds = [];
    checkboxes.forEach(cb => {
        if (cb.checked) {
            selectedPendingIds.push(cb.dataset.id);
        }
    });
    document.getElementById('approveAllBtn').disabled = selectedPendingIds.length === 0;
}

async function approveSelected() {
    if (selectedPendingIds.length === 0) return;

    if (!confirm(`選択した${selectedPendingIds.length}件を承認しますか？`)) return;

    try {
        await approveEntries(selectedPendingIds);
        showToast(`${selectedPendingIds.length}件を承認しました`, 'success');
        await loadPendingEntries();
        await loadAllData();
        updateStats();
    } catch (error) {
        console.error('Failed to approve entries:', error);
        showToast('承認に失敗しました', 'error');
    }
}

window.updateSelectedPending = updateSelectedPending;

window.approveSingle = async function(id) {
    if (!confirm('この申請を承認しますか？')) return;

    try {
        await approveEntry(id);
        showToast('承認しました', 'success');
        await loadPendingEntries();
        await loadAllData();
        updateStats();
    } catch (error) {
        console.error('Failed to approve entry:', error);
        showToast('承認に失敗しました', 'error');
    }
};

window.rejectSingle = async function(id) {
    const reason = prompt('却下理由を入力してください（任意）：', '');
    if (reason === null) return;

    try {
        await rejectEntry(id, reason);
        showToast('却下しました', 'success');
        await loadPendingEntries();
        await loadAllData();
        updateStats();
    } catch (error) {
        console.error('Failed to reject entry:', error);
        showToast('却下に失敗しました', 'error');
    }
};

// ========================================
// エントリ詳細表示
// ========================================

function showEntryDetail(entry) {
    const formatDate = (d) => d ? new Date(d).toLocaleDateString('ja-JP') : '-';
    const formatDateTime = (d) => d ? new Date(d).toLocaleString('ja-JP') : '-';

    const html = `
        <div class="detail-grid">
            <div class="detail-label">物件コード</div>
            <div class="detail-value">${escapeHtml(entry.property_code)}</div>

            <div class="detail-label">端末ID</div>
            <div class="detail-value">${escapeHtml(entry.terminal_id || '-')}</div>

            <div class="detail-label">受注先</div>
            <div class="detail-value">${escapeHtml(entry.vendor_name)}</div>

            <div class="detail-label">緊急連絡先</div>
            <div class="detail-value">${escapeHtml(entry.emergency_contact || '-')}</div>

            <div class="detail-label">点検工事案内</div>
            <div class="detail-value">${escapeHtml(entry.inspection_type)}</div>

            <div class="detail-label">テンプレートNo</div>
            <div class="detail-value">${escapeHtml(entry.template_no || '-')}</div>
        </div>

        <div class="detail-section">
            <div class="detail-section-title">点検期間</div>
            <div class="detail-grid">
                <div class="detail-label">開始日</div>
                <div class="detail-value">${formatDate(entry.inspection_start)}</div>

                <div class="detail-label">終了日</div>
                <div class="detail-value">${formatDate(entry.inspection_end)}</div>
            </div>
        </div>

        <div class="detail-section">
            <div class="detail-section-title">表示設定</div>
            <div class="detail-grid">
                <div class="detail-label">表示開始</div>
                <div class="detail-value">${formatDate(entry.display_start_date)} ${entry.display_start_time || ''}</div>

                <div class="detail-label">表示終了</div>
                <div class="detail-value">${formatDate(entry.display_end_date)} ${entry.display_end_time || ''}</div>

                <div class="detail-label">表示時間</div>
                <div class="detail-value">${entry.display_duration || 6}秒</div>

                <div class="detail-label">表示位置</div>
                <div class="detail-value">${entry.poster_position || '-'}</div>

                <div class="detail-label">貼紙区分</div>
                <div class="detail-value">${entry.poster_type === 'custom' ? '追加' : 'テンプレート'}</div>
            </div>
        </div>

        <div class="detail-section">
            <div class="detail-section-title">案内文・備考</div>
            <div class="detail-grid">
                <div class="detail-label">案内文</div>
                <div class="detail-value" style="white-space: pre-wrap;">${escapeHtml(entry.announcement || '-')}</div>

                <div class="detail-label">備考</div>
                <div class="detail-value" style="white-space: pre-wrap;">${escapeHtml(entry.remarks || '-')}</div>
            </div>
        </div>

        <div class="detail-section">
            <div class="detail-section-title">登録情報</div>
            <div class="detail-grid">
                <div class="detail-label">登録者</div>
                <div class="detail-value">${escapeHtml(getUserEmail(entry.user_id))}</div>

                <div class="detail-label">登録日時</div>
                <div class="detail-value">${formatDateTime(entry.created_at)}</div>

                <div class="detail-label">ステータス</div>
                <div class="detail-value">${entry.status === 'submitted' ? '承認済み' : '承認待ち'}</div>
            </div>
        </div>
    `;

    document.getElementById('entryDetailBody').innerHTML = html;
    document.getElementById('entryDetailModal').classList.add('active');
}

function closeEntryDetailModal() {
    document.getElementById('entryDetailModal').classList.remove('active');
}

// ========================================
// フィルター
// ========================================

function populateFilters() {
    const properties = masterData.properties;
    const filterProperty = document.getElementById('filterProperty');
    const exportProperty = document.getElementById('exportProperty');

    properties.forEach(p => {
        const opt1 = document.createElement('option');
        opt1.value = p.property_code;
        opt1.textContent = `${p.property_code} ${p.property_name}`;
        filterProperty.appendChild(opt1);

        const opt2 = opt1.cloneNode(true);
        exportProperty.appendChild(opt2);
    });
}

// ========================================
// データ一覧
// ========================================

async function loadEntries() {
    const propertyCode = document.getElementById('filterProperty').value;
    const startDate = document.getElementById('filterStartDate').value;
    const endDate = document.getElementById('filterEndDate').value;

    try {
        entries = await getAllEntries({
            propertyCode: propertyCode || undefined,
            startDate: startDate || undefined,
            endDate: endDate || undefined
        });
        renderEntries();
    } catch (error) {
        console.error('Failed to load entries:', error);
        showToast('データの取得に失敗しました', 'error');
    }
}

function renderEntries() {
    const tbody = document.getElementById('entriesBody');
    const emptyMsg = document.getElementById('entriesEmpty');

    tbody.innerHTML = '';

    if (entries.length === 0) {
        emptyMsg.style.display = 'block';
        return;
    }

    emptyMsg.style.display = 'none';

    entries.forEach(entry => {
        const tr = document.createElement('tr');
        const createdAt = new Date(entry.created_at).toLocaleString('ja-JP');
        const inspectionStart = entry.inspection_start
            ? new Date(entry.inspection_start).toLocaleDateString('ja-JP')
            : '-';

        tr.innerHTML = `
            <td>${escapeHtml(getUserEmail(entry.user_id))}</td>
            <td>${escapeHtml(entry.property_code)}</td>
            <td>${escapeHtml(entry.inspection_type)}</td>
            <td>${escapeHtml(inspectionStart)}</td>
            <td>${escapeHtml(createdAt)}</td>
            <td>
                <button class="btn btn-outline btn-sm" data-action="detail" data-id="${escapeHtml(entry.id)}">📋</button>
                <button class="btn btn-outline btn-sm" data-action="delete" data-id="${escapeHtml(entry.id)}">🗑️</button>
            </td>
        `;
        tr.querySelector('[data-action="detail"]').addEventListener('click', () => showEntryDetail(entry));
        tr.querySelector('[data-action="delete"]').addEventListener('click', () => deleteEntryById(entry.id));
        tbody.appendChild(tr);
    });

    document.getElementById('exportCount').textContent = entries.length;
}

window.deleteEntryById = async function(id) {
    if (!confirm('このデータを削除しますか？')) return;

    try {
        await deleteEntry(id);
        showToast('削除しました', 'success');
        loadEntries();
    } catch (error) {
        showToast('削除に失敗しました', 'error');
    }
};

// ========================================
// CSVエクスポート
// ========================================

function generateCSV(data) {
    if (data.length === 0) return '';

    // script.js と bulk-data.js と同じ28列のヘッダー
    const headers = [
        '点検CO', '端末ID', '物件コード', '受注先名', '緊急連絡先番号',
        '点検工事案内', '掲示板に表示する', '点検案内TPLNo', '点検開始日',
        '点検完了日', '掲示備考', '掲示板用案内文', 'frame_No', '表示開始日',
        '表示終了日', '表示開始時刻', '表示終了時刻', '表示時間', '統合ポリシー',
        '制御', '変更日', '変更時刻', '最終エクスポート日時', 'ID', '変更日時',
        '点検日時', '表示日時', '貼紙区分'
    ];

    // 現在日時
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '/');
    const timeStr = now.toTimeString().substring(0, 8);

    const csvRows = [headers.join(',')];

    data.forEach(entry => {
        const formatDate = (d) => d ? d.replace(/-/g, '/') : '';
        const displayTime = entry.display_duration || 6;
        const displayTimeFormatted = `0:00:${String(displayTime).padStart(2, '0')}`;

        const sd = formatDate(entry.inspection_start);
        const ed = formatDate(entry.inspection_end) || sd;
        const dsd = formatDate(entry.display_start_date || entry.inspection_start);
        const ded = formatDate(entry.display_end_date || entry.inspection_end) || ed;
        const displayStartTime = entry.display_start_time || '';
        const displayEndTime = entry.display_end_time || '';

        // 改行を\r\nに変換
        const remarksText = (entry.remarks || '').replace(/\n/g, '\r\n');
        const noticeText = (entry.announcement || '').replace(/\n/g, '\r\n');

        // TRUE/False（poster_type が template の場合は TRUE）
        const showOnBoard = entry.poster_type === 'template' ? 'TRUE' : 'False';

        // 貼紙区分
        const posterTypeText = entry.poster_type === 'template' ? 'テンプレート' : '追加';

        // frame_No (poster_position)
        const frameNo = entry.poster_position || '2';

        const values = [
            '',                                          // 点検CO
            entry.terminal_id || '',                     // 端末ID
            entry.property_code || '',                   // 物件コード
            entry.vendor_name || '',                     // 受注先名
            entry.emergency_contact || '',               // 緊急連絡先番号
            entry.inspection_type || '',                 // 点検工事案内
            showOnBoard,                                 // 掲示板に表示する
            entry.template_no || '',                     // 点検案内TPLNo
            sd,                                          // 点検開始日
            ed,                                          // 点検完了日
            remarksText,                                 // 掲示備考
            noticeText,                                  // 掲示板用案内文
            frameNo,                                     // frame_No
            dsd,                                         // 表示開始日
            ded,                                         // 表示終了日
            displayStartTime,                            // 表示開始時刻
            displayEndTime,                              // 表示終了時刻
            displayTimeFormatted,                        // 表示時間
            '',                                          // 統合ポリシー
            '',                                          // 制御
            dateStr,                                     // 変更日
            '',                                          // 変更時刻
            '',                                          // 最終エクスポート日時
            '',                                          // ID
            `${dateStr} [${timeStr}]`,                   // 変更日時
            `${sd} [00:00:00]`,                          // 点検日時
            `${dsd} [00:00:00]`,                         // 表示日時
            posterTypeText                               // 貼紙区分
        ];

        // CSVエスケープ処理
        csvRows.push(values.map(v => {
            if (v == null) return '';
            const s = String(v);
            return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(','));
    });

    return csvRows.join('\n');
}

function exportCSV() {
    const csv = generateCSV(entries);
    if (!csv) {
        showToast('エクスポートするデータがありません', 'error');
        return;
    }

    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);

    a.href = url;
    a.download = `admin-export-${timestamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('CSVをダウンロードしました', 'success');
}

function copyCSV() {
    const csv = generateCSV(entries);
    if (!csv) {
        showToast('コピーするデータがありません', 'error');
        return;
    }

    navigator.clipboard.writeText(csv).then(() => {
        showToast('CSVをクリップボードにコピーしました', 'success');
    }).catch(() => {
        showToast('コピーに失敗しました', 'error');
    });
}

// ========================================
// ユーザー管理
// ========================================

function loadUsers() {
    const tbody = document.getElementById('usersBody');
    tbody.innerHTML = '';

    profiles.forEach(profile => {
        const tr = document.createElement('tr');
        const createdAt = new Date(profile.created_at).toLocaleDateString('ja-JP');
        const roleClass = profile.role === 'admin' ? 'admin' : 'user';
        const roleText = profile.role === 'admin' ? '管理者' : 'ユーザー';

        tr.innerHTML = `
            <td>${profile.email}</td>
            <td>${profile.company_name || '-'}</td>
            <td><span class="user-role ${roleClass}">${roleText}</span></td>
            <td>${createdAt}</td>
            <td>
                <select class="role-select" data-user-id="${profile.id}" style="padding: 0.25rem; border-radius: 4px; border: 1px solid #e2e8f0;">
                    <option value="user" ${profile.role === 'user' ? 'selected' : ''}>ユーザー</option>
                    <option value="admin" ${profile.role === 'admin' ? 'selected' : ''}>管理者</option>
                </select>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // 権限変更イベント
    document.querySelectorAll('.role-select').forEach(select => {
        select.addEventListener('change', async (e) => {
            const userId = e.target.dataset.userId;
            const newRole = e.target.value;

            try {
                await updateProfileRole(userId, newRole);
                showToast('権限を更新しました', 'success');
                profiles = await getAllProfiles();
                loadUsers();
            } catch (error) {
                showToast('権限の更新に失敗しました', 'error');
                const profile = profiles.find(p => p.id === userId);
                if (profile) e.target.value = profile.role;
            }
        });
    });
}

// ========================================
// ユーザー追加モーダル
// ========================================

function openUserModal() {
    const modal = document.getElementById('userModal');
    const form = document.getElementById('userForm');
    form.reset();
    modal.classList.add('active');
}

function closeUserModal() {
    const modal = document.getElementById('userModal');
    modal.classList.remove('active');
}

async function handleUserFormSubmit(e) {
    e.preventDefault();

    const email = document.getElementById('newUserEmail').value.trim();
    const password = document.getElementById('newUserPassword').value;
    const companyName = document.getElementById('newUserCompany').value.trim();
    const role = document.getElementById('newUserRole').value;
    const submitBtn = document.getElementById('userSubmitBtn');

    submitBtn.disabled = true;
    submitBtn.textContent = '追加中...';

    try {
        const user = await createUser(email, password, companyName, role);

        if (user._needsEmailConfirmation) {
            showToast('ユーザーを追加しました（メール確認が必要です）', 'warning');
        } else {
            showToast('ユーザーを追加しました', 'success');
        }
        closeUserModal();

        // ユーザー一覧を更新
        profiles = await getAllProfiles();
        loadUsers();
    } catch (error) {
        console.error('User creation error:', error);
        if (error.message.includes('既に登録')) {
            showToast('このメールアドレスは既に登録されています', 'error');
        } else if (error.message.includes('プロファイル')) {
            showToast(error.message, 'error');
        } else {
            showToast('追加に失敗しました: ' + error.message, 'error');
        }
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '追加';
    }
}

// グローバルに公開
window.closeUserModal = closeUserModal;

// ========================================
// ユーティリティ
// ========================================

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}

// ========================================
// グローバルスコープに公開（マスター編集・削除）
// ========================================

window.editProperty = function(id) {
    const property = masterData.properties.find(p => p.id === id);
    if (property) openMasterModal('property', masterData, property);
};

window.editVendor = function(id) {
    const vendor = masterData.vendors.find(v => v.id === id);
    if (vendor) openMasterModal('vendor', masterData, vendor);
};

window.editInspection = function(id) {
    const inspection = masterData.inspectionTypes.find(i => i.id === id);
    if (inspection) openMasterModal('inspection', masterData, inspection);
};

window.editMasterCategory = function(id) {
    const cat = masterData.categories.find(c => c.id === id);
    if (cat) openMasterModal('category', masterData, cat);
};

window.deleteMasterProperty = async function(id) {
    await deleteMasterPropertyAction(id, masterData, entries, showToast, updateStats);
};

window.deleteMasterVendor = async function(id) {
    await deleteMasterVendorAction(id, masterData, showToast);
};

window.deleteMasterInspection = async function(id) {
    await deleteMasterInspectionAction(id, masterData, entries, showToast);
};

window.deleteMasterCategory = async function(id) {
    await deleteMasterCategoryAction(id, masterData, showToast);
};

window.closeMasterModal = closeMasterModal;
window.closeEntryDetailModal = closeEntryDetailModal;

// ========================================
// 起動
// ========================================

init();
