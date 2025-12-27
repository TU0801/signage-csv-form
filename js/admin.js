// admin.js - 管理者画面のJavaScript

import {
    getUser,
    getProfile,
    isAdmin,
    signOut,
    getAllMasterData,
    getAllEntries,
    getAllProfiles,
    updateProfileRole,
    getMasterProperties,
    getMasterVendors,
    getMasterInspectionTypes,
    deleteEntry
} from './supabase-client.js';

// ========================================
// グローバル変数
// ========================================

let masterData = { properties: [], vendors: [], inspectionTypes: [] };
let entries = [];
let profiles = [];

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
    loadEntries();
    loadMasterData();
    loadUsers();
}

async function loadAllData() {
    try {
        masterData = await getAllMasterData();
        entries = await getAllEntries();
        profiles = await getAllProfiles();
    } catch (error) {
        console.error('Failed to load data:', error);
        showToast('データの取得に失敗しました', 'error');
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
            <td>${entry.signage_profiles?.email || '-'}</td>
            <td>${entry.property_code}</td>
            <td>${entry.inspection_type}</td>
            <td>${inspectionStart}</td>
            <td>${createdAt}</td>
            <td>
                <button class="btn btn-outline btn-sm" onclick="deleteEntryById('${entry.id}')">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('exportCount').textContent = entries.length;
}

// グローバルスコープに公開
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

    const headers = [
        '点検CO', '端末ID', '物件コード', '受注先名', '緊急連絡先番号',
        '点検工事案内', '掲示板に表示する', '点検案内TPLNo', '点検開始日',
        '点検完了日', '掲示備考', '掲示板用案内文', 'frame_No', '表示開始日',
        '表示開始時刻', '表示終了日', '表示終了時刻', '貼紙区分', '表示時間',
        'カテゴリー', 'カテゴリー２', 'カテゴリー３', 'カテゴリー４',
        'カテゴリー５', 'カテゴリー６', '画像パス', 'お知らせ開始事前', 'ステータス'
    ];

    const csvRows = [headers.join(',')];

    data.forEach(entry => {
        const formatDate = (d) => d ? d.replace(/-/g, '/') : '';
        const displayTime = entry.display_duration || 6;
        const displayTimeFormatted = `0:00:${String(displayTime).padStart(2, '0')}`;

        const values = [
            '',
            entry.terminal_id || '',
            entry.property_code || '',
            entry.vendor_name || '',
            entry.emergency_contact || '',
            entry.inspection_type || '',
            'True',
            entry.template_no || '',
            formatDate(entry.inspection_start),
            formatDate(entry.inspection_end),
            entry.remarks || '',
            entry.announcement || '',
            entry.frame_no || '2',
            formatDate(entry.display_start_date || entry.inspection_start),
            entry.display_start_time || '',
            formatDate(entry.display_end_date || entry.inspection_end),
            entry.display_end_time || '',
            entry.poster_type === 'custom' ? '追加' : 'テンプレート',
            displayTimeFormatted,
            '', '', '', '', '', '', '', '30', ''
        ];

        csvRows.push(values.map(v => `"${v}"`).join(','));
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
// マスターデータ管理
// ========================================

function loadMasterData() {
    // 物件
    const propertiesList = document.getElementById('propertiesList');
    propertiesList.innerHTML = '';
    document.getElementById('propertyCount').textContent = masterData.properties.length;

    masterData.properties.forEach(p => {
        const div = document.createElement('div');
        div.className = 'master-item';
        const terminals = typeof p.terminals === 'string' ? JSON.parse(p.terminals) : p.terminals;
        div.innerHTML = `
            <div class="master-item-info">
                <div class="master-item-name">${p.property_code} ${p.property_name}</div>
                <div class="master-item-sub">端末: ${terminals?.length || 0}台</div>
            </div>
        `;
        propertiesList.appendChild(div);
    });

    // 受注先
    const vendorsList = document.getElementById('vendorsList');
    vendorsList.innerHTML = '';
    document.getElementById('vendorCount').textContent = masterData.vendors.length;

    masterData.vendors.forEach(v => {
        const div = document.createElement('div');
        div.className = 'master-item';
        div.innerHTML = `
            <div class="master-item-info">
                <div class="master-item-name">${v.vendor_name}</div>
                <div class="master-item-sub">📞 ${v.emergency_contact || '-'}</div>
            </div>
        `;
        vendorsList.appendChild(div);
    });

    // 点検種別
    const inspectionsList = document.getElementById('inspectionsList');
    inspectionsList.innerHTML = '';
    document.getElementById('inspectionCount').textContent = masterData.inspectionTypes.length;

    masterData.inspectionTypes.forEach(i => {
        const div = document.createElement('div');
        div.className = 'master-item';
        div.innerHTML = `
            <div class="master-item-info">
                <div class="master-item-name">${i.inspection_name}</div>
                <div class="master-item-sub">テンプレート: ${i.template_no}</div>
            </div>
        `;
        inspectionsList.appendChild(div);
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
                // リロード
                profiles = await getAllProfiles();
                loadUsers();
            } catch (error) {
                showToast('権限の更新に失敗しました', 'error');
                // 元に戻す
                const profile = profiles.find(p => p.id === userId);
                if (profile) e.target.value = profile.role;
            }
        });
    });
}

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
// 起動
// ========================================

init();
