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
    getMasterCategories,
    deleteEntry,
    addProperty,
    updateProperty,
    deleteProperty,
    addVendor,
    updateVendor,
    deleteVendor,
    addInspectionType,
    updateInspectionType,
    deleteInspectionType,
    addCategory,
    updateCategory,
    deleteCategory,
    getSettings,
    updateSettings,
    getPendingEntries,
    approveEntry,
    approveEntries,
    rejectEntry
} from './supabase-client.js';

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
// テンプレート画像マッピング
// ========================================

const templateImages = {
    // 点検・調査
    "Investigation": "調査",
    "building_inspection": "建物点検",
    "elevator_inspection": "エレベーター点検",
    "exterior_wall_tile_inspection": "外壁タイル点検",
    "shared_area_drain_pipe_inspection": "共用部排水管点検",
    "electrical_measurement": "電気測定",

    // 清掃
    "cleaning": "清掃",
    "cleaning_bucket": "清掃（バケツ）",
    "glass_clean": "ガラス清掃",
    "high_pressure_cleaning": "高圧洗浄",
    "high_pressure_cleaning_2": "高圧洗浄2",
    "shared_area_drain_pipe_wash": "共用部排水管洗浄",
    "drainage_pipe": "排水管",

    // 消毒・植栽
    "disinfection": "消毒",
    "disinfection_tree": "消毒・植栽",
    "planting_management": "植栽管理",

    // 工事・修繕
    "construction_building_large_scale": "大規模修繕",
    "construction_outer_wall": "外壁工事",
    "construction_light": "照明工事",
    "construction_toolbox": "工具箱工事",
    "construction_television_equipment": "テレビ設備工事",
    "construction_jcom_cable": "JCOM配線工事",
    "construction_Intercom": "インターホン工事",
    "construction_coin_parking": "コインパーキング工事",
    "construction_involving_sound_vibration": "騒音・振動工事",
    "construction_roller_paint": "ローラー塗装",
    "construction_spanner": "スパナ工事",
    "construction_mobile_antenna": "モバイルアンテナ工事",
    "Construction_without_sound": "静音工事",
    "waterproof_construction": "防水工事",
    "fire_construction": "消防工事",
    "vending_machine_construction": "自販機工事",
    "vending_machine_construction_2": "自販機工事2",
    "water_activator_construction": "水質活性化工事",
    "water_supply_pump_construction": "給水ポンプ工事",

    // 塗装
    "painting_water_pipe": "水道管塗装",
    "iron_part_coating": "鉄部塗装",

    // 交換
    "exchange_light_battery": "照明・電池交換",
    "exchange_light_battery_2": "照明・電池交換2",
    "exchange_corridor": "廊下交換",
    "elevator_mat_replacement": "エレベーターマット交換",
    "fire_exchange": "消防設備交換",
    "fire_extinguisher_explain": "消火器説明",

    // 設備
    "automtic_doors": "自動ドア",
    "mechanical_parking": "機械式駐車場",
    "mechanical_parking_turntable": "ターンテーブル駐車場",
    "tower_mechanical_parking": "タワー式駐車場",
    "delivery_box": "宅配ボックス",
    "delivery_box_stop_using": "宅配ボックス使用停止",
    "simple_dedicated_water_supply": "専用水道設備",
    "shared_electrical_equipment": "共用部電気設備",
    "card_reader": "カードリーダー",

    // 防犯・安全
    "surveillance_camera": "防犯カメラ",
    "surveillance_camera_installation_work": "防犯カメラ設置",
    "protect_balcony_from_birds": "鳥害対策",
    "protect_balcony_from_birds_2": "鳥害対策2",

    // その他
    "bicycle_removal": "自転車撤去",
    "merchari_installation": "メルカリ設置",
    "Questionnaire_conducted01": "アンケート",
    "Questionnaire_conducted02": "アンケート2"
};

// ========================================
// グローバル変数
// ========================================

let masterData = { properties: [], vendors: [], inspectionTypes: [], categories: [] };
let appSettings = {};
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
    loadMasterData();
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
    document.getElementById('addPropertyBtn').addEventListener('click', () => openMasterModal('property'));
    document.getElementById('addVendorBtn').addEventListener('click', () => openMasterModal('vendor'));
    document.getElementById('addInspectionBtn').addEventListener('click', () => openMasterModal('inspection'));
    document.getElementById('addCategoryBtn')?.addEventListener('click', () => openMasterModal('category'));

    // マスター検索
    document.getElementById('propertySearch')?.addEventListener('input', (e) => {
        renderProperties(e.target.value);
    });
    document.getElementById('vendorSearch')?.addEventListener('input', (e) => {
        renderVendors(e.target.value);
    });
    document.getElementById('inspectionSearch')?.addEventListener('input', (e) => {
        renderInspections(e.target.value);
    });
    document.getElementById('categorySearch')?.addEventListener('input', (e) => {
        renderCategories(e.target.value);
    });

    // 設定保存ボタン
    document.getElementById('saveSettingsBtn')?.addEventListener('click', saveSettings);

    // マスターフォーム送信
    document.getElementById('masterForm').addEventListener('submit', handleMasterFormSubmit);

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
                <button class="btn btn-success btn-sm" data-action="approve" data-id="${escapeHtml(entry.id)}">✅</button>
                <button class="btn btn-outline btn-sm" data-action="reject" data-id="${escapeHtml(entry.id)}">❌</button>
            </td>
        `;
        // イベントリスナーを追加
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
    if (reason === null) return; // キャンセル

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
                <button class="btn btn-outline btn-sm" data-action="delete" data-id="${escapeHtml(entry.id)}">🗑️</button>
            </td>
        `;
        tr.querySelector('[data-action="delete"]').addEventListener('click', () => deleteEntryById(entry.id));
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
    renderProperties();
    renderVendors();
    renderInspections();
    loadCategories();
}

function renderProperties(filter = '') {
    const propertiesList = document.getElementById('propertiesList');
    propertiesList.innerHTML = '';

    const filtered = masterData.properties.filter(p => {
        if (!filter) return true;
        const searchText = `${p.property_code} ${p.property_name}`.toLowerCase();
        return searchText.includes(filter.toLowerCase());
    });

    document.getElementById('propertyCount').textContent = filtered.length;

    if (filtered.length === 0) {
        propertiesList.innerHTML = `
            <div class="master-empty">
                <div class="master-empty-icon">📋</div>
                <h4>${filter ? '検索結果がありません' : '物件が登録されていません'}</h4>
                <p>${filter ? '検索条件を変更してください' : '「新規追加」から物件を追加してください'}</p>
            </div>
        `;
        return;
    }

    filtered.forEach(p => {
        const div = document.createElement('div');
        div.className = 'master-item';
        div.dataset.id = p.id;
        const terminals = typeof p.terminals === 'string' ? JSON.parse(p.terminals) : p.terminals;
        div.innerHTML = `
            <div class="master-item-info">
                <div class="master-item-name">${escapeHtml(p.property_code)} ${escapeHtml(p.property_name)}</div>
                <div class="master-item-sub">端末: ${terminals?.length || 0}台</div>
            </div>
            <div class="master-item-actions">
                <button class="btn btn-outline btn-sm" data-action="edit">編集</button>
                <button class="btn btn-outline btn-sm btn-danger-outline" data-action="delete">削除</button>
            </div>
        `;
        div.querySelector('[data-action="edit"]').addEventListener('click', () => editProperty(p.id));
        div.querySelector('[data-action="delete"]').addEventListener('click', () => deleteMasterProperty(p.id));
        propertiesList.appendChild(div);
    });
}

function renderVendors(filter = '') {
    const vendorsList = document.getElementById('vendorsList');
    vendorsList.innerHTML = '';

    const filtered = masterData.vendors.filter(v => {
        if (!filter) return true;
        return v.vendor_name.toLowerCase().includes(filter.toLowerCase());
    });

    document.getElementById('vendorCount').textContent = filtered.length;

    if (filtered.length === 0) {
        vendorsList.innerHTML = `
            <div class="master-empty">
                <div class="master-empty-icon">🏢</div>
                <h4>${filter ? '検索結果がありません' : '受注先が登録されていません'}</h4>
                <p>${filter ? '検索条件を変更してください' : '「新規追加」から受注先を追加してください'}</p>
            </div>
        `;
        return;
    }

    filtered.forEach(v => {
        const div = document.createElement('div');
        div.className = 'master-item';
        div.dataset.id = v.id;
        div.innerHTML = `
            <div class="master-item-info">
                <div class="master-item-name">${escapeHtml(v.vendor_name)}</div>
                <div class="master-item-sub">📞 ${escapeHtml(v.emergency_contact) || '連絡先未設定'}</div>
            </div>
            <div class="master-item-actions">
                <button class="btn btn-outline btn-sm" data-action="edit">編集</button>
                <button class="btn btn-outline btn-sm btn-danger-outline" data-action="delete">削除</button>
            </div>
        `;
        div.querySelector('[data-action="edit"]').addEventListener('click', () => editVendor(v.id));
        div.querySelector('[data-action="delete"]').addEventListener('click', () => deleteMasterVendor(v.id));
        vendorsList.appendChild(div);
    });
}

function renderInspections(filter = '') {
    const inspectionsList = document.getElementById('inspectionsList');
    inspectionsList.innerHTML = '';

    const filtered = masterData.inspectionTypes.filter(i => {
        if (!filter) return true;
        return i.inspection_name.toLowerCase().includes(filter.toLowerCase());
    });

    document.getElementById('inspectionCount').textContent = filtered.length;

    if (filtered.length === 0) {
        inspectionsList.innerHTML = `
            <div class="master-empty">
                <div class="master-empty-icon">🔧</div>
                <h4>${filter ? '検索結果がありません' : '点検種別が登録されていません'}</h4>
                <p>${filter ? '検索条件を変更してください' : '「新規追加」から点検種別を追加してください'}</p>
            </div>
        `;
        return;
    }

    filtered.forEach(i => {
        const div = document.createElement('div');
        div.className = 'master-item';
        div.dataset.id = i.id;
        const categoryBadge = i.category ? `<span style="background: #e0e7ff; color: #3730a3; padding: 0.125rem 0.5rem; border-radius: 4px; font-size: 0.75rem; margin-left: 0.5rem;">${escapeHtml(i.category)}</span>` : '';
        const templateLabel = i.template_no ? (templateImages[i.template_no] || i.template_no) : '未設定';
        div.innerHTML = `
            <div class="master-item-info">
                <div class="master-item-name">${escapeHtml(i.inspection_name)}${categoryBadge}</div>
                <div class="master-item-sub">画像: ${escapeHtml(templateLabel)}</div>
            </div>
            <div class="master-item-actions">
                <button class="btn btn-outline btn-sm" data-action="edit">編集</button>
                <button class="btn btn-outline btn-sm btn-danger-outline" data-action="delete">削除</button>
            </div>
        `;
        div.querySelector('[data-action="edit"]').addEventListener('click', () => editInspection(i.id));
        div.querySelector('[data-action="delete"]').addEventListener('click', () => deleteMasterInspection(i.id));
        inspectionsList.appendChild(div);
    });
}

// ========================================
// マスターモーダル
// ========================================

function openMasterModal(type, data = null) {
    const modal = document.getElementById('masterModal');
    const title = document.getElementById('masterModalTitle');

    // 全フィールドを非表示
    document.getElementById('propertyFields').style.display = 'none';
    document.getElementById('vendorFields').style.display = 'none';
    document.getElementById('inspectionFields').style.display = 'none';
    document.getElementById('categoryFields')?.style && (document.getElementById('categoryFields').style.display = 'none');

    // タイプを設定
    document.getElementById('masterType').value = type;
    document.getElementById('masterId').value = data?.id || '';

    // タイプに応じてフィールドを表示
    if (type === 'property') {
        document.getElementById('propertyFields').style.display = 'block';
        title.textContent = data ? '物件を編集' : '物件を追加';
        if (data) {
            document.getElementById('propertyCode').value = data.property_code || '';
            document.getElementById('propertyName').value = data.property_name || '';
            document.getElementById('terminalId').value = data.terminal_id || '';
            document.getElementById('supplement').value = data.supplement || '';
            document.getElementById('address').value = data.address || '';
        } else {
            document.getElementById('propertyCode').value = '';
            document.getElementById('propertyName').value = '';
            document.getElementById('terminalId').value = '';
            document.getElementById('supplement').value = '';
            document.getElementById('address').value = '';
        }
    } else if (type === 'vendor') {
        document.getElementById('vendorFields').style.display = 'block';
        title.textContent = data ? '受注先を編集' : '受注先を追加';
        if (data) {
            document.getElementById('vendorName').value = data.vendor_name || '';
            document.getElementById('emergencyContact').value = data.emergency_contact || '';
            document.getElementById('vendorCategory').value = data.category || '点検';
        } else {
            document.getElementById('vendorName').value = '';
            document.getElementById('emergencyContact').value = '';
            document.getElementById('vendorCategory').value = '点検';
        }
    } else if (type === 'inspection') {
        document.getElementById('inspectionFields').style.display = 'block';
        title.textContent = data ? '点検種別を編集' : '点検種別を追加';

        // カテゴリドロップダウンを構築
        const categorySelect = document.getElementById('inspectionCategory');
        categorySelect.innerHTML = '<option value="">カテゴリを選択</option>';
        (masterData.categories || []).forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.category_name;
            option.textContent = cat.category_name;
            categorySelect.appendChild(option);
        });

        // テンプレート画像ドロップダウンを構築
        const templateSelect = document.getElementById('templateNo');
        templateSelect.innerHTML = '<option value="">画像なし</option>';
        Object.entries(templateImages).forEach(([key, label]) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = label;
            templateSelect.appendChild(option);
        });

        // プレビュー更新イベント
        templateSelect.onchange = () => updateTemplatePreview(templateSelect.value);

        if (data) {
            document.getElementById('inspectionName').value = data.inspection_name || '';
            categorySelect.value = data.category || '';

            // 日時プレフィックス付きの場合（例: "1124 235959cleaning"）、キーを抽出
            let templateKeyForSelect = data.template_no || '';
            if (templateKeyForSelect && !templateImages[templateKeyForSelect]) {
                for (const key of Object.keys(templateImages)) {
                    if (templateKeyForSelect.endsWith(key)) {
                        templateKeyForSelect = key;
                        break;
                    }
                }
            }
            templateSelect.value = templateKeyForSelect;

            document.getElementById('noticeText').value = data.notice_text || '';
            document.getElementById('showOnBoard').checked = data.show_on_board !== false;
            updateTemplatePreview(data.template_no);
        } else {
            document.getElementById('inspectionName').value = '';
            categorySelect.value = '';
            templateSelect.value = '';
            document.getElementById('noticeText').value = '';
            document.getElementById('showOnBoard').checked = true;
            updateTemplatePreview('');
        }
    } else if (type === 'category') {
        document.getElementById('categoryFields').style.display = 'block';
        title.textContent = data ? 'カテゴリを編集' : 'カテゴリを追加';
        if (data) {
            document.getElementById('categoryName').value = data.category_name || '';
            document.getElementById('categorySortOrder').value = data.sort_order || 0;
        } else {
            document.getElementById('categoryName').value = '';
            document.getElementById('categorySortOrder').value = 0;
        }
    }

    modal.classList.add('active');
}

function closeMasterModal() {
    document.getElementById('masterModal').classList.remove('active');
    document.getElementById('masterForm').reset();
    updateTemplatePreview('');
}

function updateTemplatePreview(templateKey) {
    const preview = document.getElementById('templatePreview');
    if (!preview) return;

    if (!templateKey) {
        preview.innerHTML = '<span style="color: #94a3b8; font-size: 0.875rem;">プレビュー</span>';
        return;
    }

    // 直接マッチするか確認
    let matchedKey = templateKey;
    if (!templateImages[templateKey]) {
        // 日時プレフィックス付きの場合（例: "1124 235959cleaning"）、末尾のキーを抽出
        for (const key of Object.keys(templateImages)) {
            if (templateKey.endsWith(key)) {
                matchedKey = key;
                break;
            }
        }
    }

    if (templateImages[matchedKey]) {
        preview.innerHTML = `<img src="images/${matchedKey}.png" alt="${templateImages[matchedKey]}" style="max-height: 120px; max-width: 100%; border-radius: 4px;" onerror="this.parentElement.innerHTML='<span style=\\'color: #ef4444; font-size: 0.875rem;\\'>画像が見つかりません</span>'">`;
    } else {
        preview.innerHTML = `<span style="color: #94a3b8; font-size: 0.875rem;">${escapeHtml(templateKey)}</span>`;
    }
}

async function handleMasterFormSubmit(e) {
    e.preventDefault();

    const type = document.getElementById('masterType').value;
    const id = document.getElementById('masterId').value;

    try {
        if (type === 'property') {
            const data = {
                property_code: parseInt(document.getElementById('propertyCode').value),
                property_name: document.getElementById('propertyName').value,
                terminal_id: document.getElementById('terminalId').value,
                supplement: document.getElementById('supplement').value,
                address: document.getElementById('address').value,
            };
            if (id) {
                await updateProperty(id, data);
                showToast('物件を更新しました', 'success');
            } else {
                await addProperty(data);
                showToast('物件を追加しました', 'success');
            }
        } else if (type === 'vendor') {
            const data = {
                vendor_name: document.getElementById('vendorName').value,
                emergency_contact: document.getElementById('emergencyContact').value,
                category: document.getElementById('vendorCategory').value,
            };
            if (id) {
                await updateVendor(id, data);
                showToast('受注先を更新しました', 'success');
            } else {
                await addVendor(data);
                showToast('受注先を追加しました', 'success');
            }
        } else if (type === 'inspection') {
            const data = {
                inspection_name: document.getElementById('inspectionName').value,
                category: document.getElementById('inspectionCategory').value,
                template_no: document.getElementById('templateNo').value,
                notice_text: document.getElementById('noticeText').value,
                show_on_board: document.getElementById('showOnBoard').checked,
            };
            if (id) {
                await updateInspectionType(id, data);
                showToast('点検種別を更新しました', 'success');
            } else {
                await addInspectionType(data);
                showToast('点検種別を追加しました', 'success');
            }
        } else if (type === 'category') {
            const data = {
                category_name: document.getElementById('categoryName').value,
                sort_order: parseInt(document.getElementById('categorySortOrder').value) || 0,
            };
            if (id) {
                await updateCategory(id, data);
                showToast('カテゴリを更新しました', 'success');
            } else {
                await addCategory(data);
                showToast('カテゴリを追加しました', 'success');
            }
        }

        closeMasterModal();
        // マスターデータを再読み込み
        masterData = await getAllMasterData();
        loadMasterData();
        updateStats();
    } catch (error) {
        console.error('Failed to save master data:', error);
        showToast('保存に失敗しました', 'error');
    }
}

// グローバルスコープに公開（編集・削除）
window.editProperty = function(id) {
    const property = masterData.properties.find(p => p.id === id);
    if (property) openMasterModal('property', property);
};

window.editVendor = function(id) {
    const vendor = masterData.vendors.find(v => v.id === id);
    if (vendor) openMasterModal('vendor', vendor);
};

window.editInspection = function(id) {
    const inspection = masterData.inspectionTypes.find(i => i.id === id);
    if (inspection) openMasterModal('inspection', inspection);
};

window.deleteMasterProperty = async function(id) {
    // 使用中チェック
    const property = masterData.properties.find(p => p.id === id);
    if (property) {
        const usedEntries = entries.filter(e => e.property_code === property.property_code);
        if (usedEntries.length > 0) {
            showToast(`この物件は${usedEntries.length}件のエントリで使用中です`, 'error');
            return;
        }
    }
    if (!confirm('この物件を削除しますか？')) return;
    try {
        await deleteProperty(id);
        showToast('物件を削除しました', 'success');
        masterData = await getAllMasterData();
        loadMasterData();
        updateStats();
    } catch (error) {
        showToast('削除に失敗しました', 'error');
    }
};

window.deleteMasterVendor = async function(id) {
    if (!confirm('この受注先を削除しますか？')) return;
    try {
        await deleteVendor(id);
        showToast('受注先を削除しました', 'success');
        masterData = await getAllMasterData();
        loadMasterData();
    } catch (error) {
        showToast('削除に失敗しました', 'error');
    }
};

window.deleteMasterInspection = async function(id) {
    // 使用中チェック
    const inspection = masterData.inspectionTypes.find(i => i.id === id);
    if (inspection) {
        const usedEntries = entries.filter(e => e.inspection_type === inspection.inspection_name);
        if (usedEntries.length > 0) {
            showToast(`この点検種別は${usedEntries.length}件のエントリで使用中です`, 'error');
            return;
        }
    }
    if (!confirm('この点検種別を削除しますか？')) return;
    try {
        await deleteInspectionType(id);
        showToast('点検種別を削除しました', 'success');
        masterData = await getAllMasterData();
        loadMasterData();
    } catch (error) {
        showToast('削除に失敗しました', 'error');
    }
};

window.closeMasterModal = closeMasterModal;

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
// 設定管理
// ========================================

async function loadAppSettings() {
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
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

async function saveSettings() {
    try {
        const settings = {
            display_time_max: document.getElementById('settingDisplayTimeMax').value,
            remarks_chars_per_line: document.getElementById('settingRemarksCharsPerLine').value,
            remarks_max_lines: document.getElementById('settingRemarksMaxLines').value,
            notice_text_max_chars: document.getElementById('settingNoticeTextMaxChars').value
        };

        await updateSettings(settings);
        showToast('設定を保存しました', 'success');
    } catch (error) {
        console.error('Failed to save settings:', error);
        showToast('設定の保存に失敗しました', 'error');
    }
}

// ========================================
// カテゴリ管理
// ========================================

async function loadCategories() {
    try {
        masterData.categories = await getMasterCategories();
        renderCategories();
    } catch (error) {
        console.error('Failed to load categories:', error);
    }
}

function renderCategories(filter = '') {
    const list = document.getElementById('categoriesList');
    if (!list) return;
    list.innerHTML = '';

    const filtered = (masterData.categories || []).filter(cat => {
        if (!filter) return true;
        return cat.category_name.toLowerCase().includes(filter.toLowerCase());
    });

    const count = document.getElementById('categoryCount');
    if (count) count.textContent = filtered.length;

    if (filtered.length === 0) {
        list.innerHTML = `
            <div class="master-empty">
                <div class="master-empty-icon">📁</div>
                <h4>${filter ? '検索結果がありません' : 'カテゴリが登録されていません'}</h4>
                <p>${filter ? '検索条件を変更してください' : '「新規追加」からカテゴリを追加してください'}</p>
            </div>
        `;
        return;
    }

    filtered.forEach(cat => {
        const div = document.createElement('div');
        div.className = 'master-item';
        div.dataset.id = cat.id;
        div.innerHTML = `
            <div class="master-item-info">
                <div class="master-item-name">${escapeHtml(cat.category_name)}</div>
                <div class="master-item-sub">表示順序: ${cat.sort_order || 0}</div>
            </div>
            <div class="master-item-actions">
                <button class="btn btn-sm btn-outline" data-action="edit">編集</button>
                <button class="btn btn-sm btn-outline btn-danger-outline" data-action="delete">削除</button>
            </div>
        `;
        div.querySelector('[data-action="edit"]').addEventListener('click', () => editMasterCategory(cat.id));
        div.querySelector('[data-action="delete"]').addEventListener('click', () => deleteMasterCategory(cat.id));
        list.appendChild(div);
    });
}

window.editMasterCategory = function(id) {
    const cat = masterData.categories.find(c => c.id === id);
    if (!cat) return;
    openMasterModal('category', cat);
};

window.deleteMasterCategory = async function(id) {
    if (!confirm('このカテゴリを削除しますか？')) return;
    try {
        await deleteCategory(id);
        showToast('カテゴリを削除しました', 'success');
        loadCategories();
    } catch (error) {
        showToast('削除に失敗しました', 'error');
    }
};

// ========================================
// 起動
// ========================================

init();
