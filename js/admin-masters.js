// admin-masters.js - マスタデータ管理

import {
    getAllMasterData,
    getMasterCategories,
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
    getMasterTemplateImages,
    addTemplateImage,
    updateTemplateImage,
    deleteTemplateImage,
    uploadTemplateImageFile,
    deleteTemplateImageFile
} from './supabase-client.js';

// ========================================
// テンプレート画像マッピング
// ========================================

export const templateImages = {
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
    "automatic_doors": "自動ドア",
    "mechanical_parking": "機械式駐車場",
    "mechanical_parking_turntable": "ターンテーブル駐車場",
    "tower_mechanical_parking": "タワー式駐車場",
    "delivery_box": "宅配ボックス",
    "delivery_box_stop_using": "宅配ボックス使用停止",
    "simple_dedicated_water_supply": "専用水道設備",
    "shared_electrical_equipment": "共用部電気設備",
    "card_reader": "カードリーダー",
    "mail_box": "メールボックス",
    "drain_pipe_cleaning_truck": "排水管洗浄トラック",

    // 防犯・安全
    "surveillance_camera": "防犯カメラ",
    "surveillance_camera_installation_work": "防犯カメラ設置",
    "protect_balcony_from_birds": "鳥害対策",
    "protect_balcony_from_birds_2": "鳥害対策2",

    // その他
    "bicycle_removal": "自転車撤去",
    "merchari_installation": "シェアサイクル設置",
    "disinfection": "消毒",
    "questionnaire_conducted01": "アンケート",
    "questionnaire_conducted02": "アンケート2"
};

// ========================================
// HTMLエスケープ
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
// マスターデータ描画
// ========================================

export function loadMasterData(masterData) {
    renderProperties(masterData);
    renderVendors(masterData);
    renderInspections(masterData);
    loadCategories(masterData);
    renderTemplateImages(masterData);
}

export function renderProperties(masterData, filter = '') {
    const propertiesList = document.getElementById('propertiesList');
    propertiesList.innerHTML = '';

    // masterData.propertiesは既にグループ化済み（getAllMasterData()から）
    // フィルタリングのみ実行
    const properties = masterData.properties.filter(p => {
        if (!filter) return true;
        const searchText = `${p.property_code} ${p.property_name}`.toLowerCase();
        return searchText.includes(filter.toLowerCase());
    });

    document.getElementById('propertyCount').textContent = properties.length;

    if (properties.length === 0) {
        propertiesList.innerHTML = `
            <div class="master-empty">
                <div class="master-empty-icon">📋</div>
                <h4>${filter ? '検索結果がありません' : '物件が登録されていません'}</h4>
                <p>${filter ? '検索条件を変更してください' : '「新規追加」から物件を追加してください'}</p>
            </div>
        `;
        return;
    }

    properties.forEach(p => {
        const div = document.createElement('div');
        div.className = 'master-item';
        div.dataset.propertyCode = p.property_code;

        // 端末情報を簡潔に表示
        const terminals = p.terminals || [];
        const terminalDisplay = terminals.length > 0
            ? terminals.map(t => t.terminal_id || t.terminalId).filter(Boolean).slice(0, 4).join(', ') + (terminals.length > 4 ? '...' : '')
            : 'なし';

        div.innerHTML = `
            <div class="master-item-name">${escapeHtml(p.property_code)}</div>
            <div class="master-item-details">
                <span>${escapeHtml(p.property_name)}</span>
                <span>端末: ${escapeHtml(terminalDisplay)} (${terminals.length}台)</span>
            </div>
            <div class="master-item-actions">
                <button class="btn btn-outline btn-sm" data-action="edit">編集</button>
                <button class="btn btn-outline btn-sm btn-danger-outline" data-action="delete">削除</button>
            </div>
        `;
        div.querySelector('[data-action="edit"]').addEventListener('click', () => window.editPropertyByCode(p.property_code));
        div.querySelector('[data-action="delete"]').addEventListener('click', () => window.deletePropertyByCode(p.property_code));
        propertiesList.appendChild(div);
    });
}

export function renderVendors(masterData, filter = '') {
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
                <h4>${filter ? '検索結果がありません' : '保守会社が登録されていません'}</h4>
                <p>${filter ? '検索条件を変更してください' : '「新規追加」から保守会社を追加してください'}</p>
            </div>
        `;
        return;
    }

    filtered.forEach(v => {
        const div = document.createElement('div');
        div.className = 'master-item';
        div.dataset.id = v.id;

        const inspectionType = v.inspection_type || '-';

        div.innerHTML = `
            <div class="master-item-name">${escapeHtml(v.vendor_name)}</div>
            <div class="master-item-details">
                <span>📞 ${escapeHtml(v.emergency_contact) || '連絡先未設定'}</span>
                <span>点検種別: ${escapeHtml(inspectionType)}</span>
            </div>
            <div class="master-item-actions">
                <button class="btn btn-outline btn-sm" data-action="edit">編集</button>
                <button class="btn btn-outline btn-sm btn-danger-outline" data-action="delete">削除</button>
            </div>
        `;
        div.querySelector('[data-action="edit"]').addEventListener('click', () => window.editVendor(v.id));
        div.querySelector('[data-action="delete"]').addEventListener('click', () => window.deleteMasterVendor(v.id));
        vendorsList.appendChild(div);
    });
}

export function renderInspections(masterData, filter = '') {
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
        const categoryBadge = i.category ? `<span style="background: #e0e7ff; color: #3730a3; padding: 0.25rem 0.625rem; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">${escapeHtml(i.category)}</span>` : '';
        const templateLabel = i.template_no ? (templateImages[i.template_no] || i.template_no) : '未設定';

        div.innerHTML = `
            <div class="master-item-name">${escapeHtml(i.inspection_name)}</div>
            <div class="master-item-details">
                ${categoryBadge ? `<span>${categoryBadge}</span>` : '<span>-</span>'}
                <span>画像: ${escapeHtml(templateLabel)}</span>
            </div>
            <div class="master-item-actions">
                <button class="btn btn-outline btn-sm" data-action="edit">編集</button>
                <button class="btn btn-outline btn-sm btn-danger-outline" data-action="delete">削除</button>
            </div>
        `;
        div.querySelector('[data-action="edit"]').addEventListener('click', () => window.editInspection(i.id));
        div.querySelector('[data-action="delete"]').addEventListener('click', () => window.deleteMasterInspection(i.id));
        inspectionsList.appendChild(div);
    });
}

export function renderCategories(masterData, filter = '') {
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
            <div class="master-item-name">${escapeHtml(cat.category_name)}</div>
            <div class="master-item-details">
                <span>表示順序: ${cat.sort_order || 0}</span>
            </div>
            <div class="master-item-actions">
                <button class="btn btn-sm btn-outline" data-action="edit">編集</button>
                <button class="btn btn-sm btn-outline btn-danger-outline" data-action="delete">削除</button>
            </div>
        `;
        div.querySelector('[data-action="edit"]').addEventListener('click', () => window.editMasterCategory(cat.id));
        div.querySelector('[data-action="delete"]').addEventListener('click', () => window.deleteMasterCategory(cat.id));
        list.appendChild(div);
    });
}

export async function loadCategories(masterData) {
    try {
        masterData.categories = await getMasterCategories();
        renderCategories(masterData);
    } catch (error) {
        console.error('Failed to load categories:', error);
    }
}

export function renderTemplateImages(masterData, filter = '', categoryFilter = '') {
    const list = document.getElementById('templateImagesList');
    if (!list) return;
    list.innerHTML = '';

    const templateImages = masterData.templateImages || [];
    const categories = (masterData.categories || []).map(c => c.category_name);

    let filtered = templateImages.filter(ti => {
        // カテゴリーフィルター
        if (categoryFilter && ti.category !== categoryFilter) return false;

        // 検索フィルター
        if (!filter) return true;
        const searchText = `${ti.image_key} ${ti.display_name} ${ti.category || ''}`.toLowerCase();
        return searchText.includes(filter.toLowerCase());
    });

    const count = document.getElementById('templateImageCount');
    if (count) count.textContent = filtered.length;

    if (filtered.length === 0) {
        list.innerHTML = `
            <div class="master-empty" style="grid-column: 1 / -1;">
                <div class="master-empty-icon">🖼️</div>
                <h4>${filter ? '検索結果がありません' : 'テンプレート画像が登録されていません'}</h4>
                <p>${filter ? '検索条件を変更してください' : '「新規追加」からテンプレート画像を追加してください'}</p>
            </div>
        `;
        return;
    }

    // カテゴリー別にグループ化
    const groupedByCategory = {};
    categories.forEach(cat => { groupedByCategory[cat] = []; });
    groupedByCategory['その他'] = [];

    filtered.forEach(ti => {
        const category = ti.category || 'その他';
        if (!groupedByCategory[category]) {
            groupedByCategory[category] = [];
        }
        groupedByCategory[category].push(ti);
    });

    // カテゴリーごとに表示
    Object.entries(groupedByCategory).forEach(([category, images]) => {
        if (images.length === 0) return;

        // カテゴリーヘッダー
        const header = document.createElement('div');
        header.style.gridColumn = '1 / -1';
        header.style.fontSize = '1rem';
        header.style.fontWeight = '700';
        header.style.color = '#1e293b';
        header.style.marginTop = '1.5rem';
        header.style.marginBottom = '0.75rem';
        header.style.borderBottom = '2px solid #e2e8f0';
        header.style.paddingBottom = '0.5rem';
        header.textContent = `${category} (${images.length}件)`;
        list.appendChild(header);

        // 画像カード
        images.forEach(ti => {
        const card = document.createElement('div');
        card.className = 'template-image-card';
        card.dataset.id = ti.id;
        card.innerHTML = `
            <img src="${escapeHtml(ti.image_url)}" alt="${escapeHtml(ti.display_name)}"
                 loading="lazy"
                 onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23f1f5f9%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2250%22 text-anchor=%22middle%22 dy=%22.35em%22 fill=%22%2394a3b8%22 font-size=%2212%22>No Image</text></svg>'">
            <div class="template-image-card-body">
                <div class="template-image-card-title">${escapeHtml(ti.display_name)}</div>
                <div class="template-image-card-key">${escapeHtml(ti.image_key)}</div>
                ${ti.category ? `<span class="template-image-card-category">${escapeHtml(ti.category)}</span>` : ''}
            </div>
            <div class="template-image-card-actions">
                <button class="btn-edit" data-action="edit">編集</button>
                <button class="btn-delete" data-action="delete">削除</button>
            </div>
        `;
        card.querySelector('[data-action="edit"]').addEventListener('click', (e) => {
            e.stopPropagation();
            window.editTemplateImage(ti.id);
        });
        card.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
            e.stopPropagation();
            window.deleteMasterTemplateImage(ti.id);
        });
        list.appendChild(card);
        });
    });
}

// ========================================
// マスターモーダル
// ========================================

// 端末フィールドを追加する関数
function addTerminalField(terminal = {}) {
    const terminalsList = document.getElementById('terminalsList');
    const terminalDiv = document.createElement('div');
    terminalDiv.className = 'terminal-item';
    terminalDiv.style.cssText = 'display: flex; gap: 0.5rem; align-items: center;';

    terminalDiv.innerHTML = `
        <input type="text" class="terminal-id" placeholder="端末ID" value="${escapeHtml(terminal.terminal_id || terminal.terminalId || '')}" style="flex: 1;" required>
        <input type="text" class="terminal-supplement" placeholder="補足（任意）" value="${escapeHtml(terminal.supplement || '')}" style="flex: 1;">
        <button type="button" class="btn btn-outline btn-sm btn-danger-outline remove-terminal-btn">削除</button>
    `;

    // 削除ボタンのイベントリスナー
    terminalDiv.querySelector('.remove-terminal-btn').addEventListener('click', () => {
        if (terminalsList.children.length > 1) {
            terminalDiv.remove();
        } else {
            alert('最低1つの端末が必要です');
        }
    });

    terminalsList.appendChild(terminalDiv);
}

export function openMasterModal(type, masterData, data = null) {
    const modal = document.getElementById('masterModal');
    const title = document.getElementById('masterModalTitle');

    // 全フィールドを非表示＆無効化（required属性のバリデーションを回避）
    const allSections = ['propertyFields', 'vendorFields', 'inspectionFields', 'categoryFields', 'templateImageFields'];
    allSections.forEach(sectionId => {
        const section = document.getElementById(sectionId);
        if (section) {
            section.style.display = 'none';
            // セクション内のすべてのinput/select/textareaを無効化
            section.querySelectorAll('input, select, textarea').forEach(el => {
                el.disabled = true;
            });
        }
    });

    // タイプを設定
    document.getElementById('masterType').value = type;
    document.getElementById('masterId').value = data?.id || '';

    // タイプに応じてフィールドを表示＆有効化
    if (type === 'property') {
        const section = document.getElementById('propertyFields');
        section.style.display = 'block';
        section.querySelectorAll('input, select, textarea').forEach(el => el.disabled = false);
        title.textContent = data ? '物件を編集' : '物件を追加';

        // 端末リストを初期化
        const terminalsList = document.getElementById('terminalsList');
        terminalsList.innerHTML = '';

        // 端末追加ボタンのイベントリスナーを設定
        const addTerminalBtn = document.getElementById('addTerminalBtn');
        addTerminalBtn.onclick = () => addTerminalField();

        if (data) {
            document.getElementById('propertyCode').value = data.property_code || '';
            document.getElementById('propertyName').value = data.property_name || '';
            document.getElementById('supplement').value = data.supplement || '';
            document.getElementById('address').value = data.address || '';

            // 端末リストを表示
            const terminals = typeof data.terminals === 'string' ? JSON.parse(data.terminals) : data.terminals || [];
            if (terminals.length > 0) {
                terminals.forEach(terminal => addTerminalField(terminal));
            } else {
                // 端末がない場合は1つ追加
                addTerminalField();
            }
        } else {
            document.getElementById('propertyCode').value = '';
            document.getElementById('propertyName').value = '';
            document.getElementById('supplement').value = '';
            document.getElementById('address').value = '';
            // 新規追加の場合は1つ端末フィールドを追加
            addTerminalField();
        }
    } else if (type === 'vendor') {
        const section = document.getElementById('vendorFields');
        section.style.display = 'block';
        section.querySelectorAll('input, select, textarea').forEach(el => el.disabled = false);
        title.textContent = data ? '保守会社を編集' : '保守会社を追加';
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
        const section = document.getElementById('inspectionFields');
        section.style.display = 'block';
        section.querySelectorAll('input, select, textarea').forEach(el => el.disabled = false);
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

        // テンプレート画像ドロップダウンを構築（DBテンプレート優先、ハードコードをフォールバック）
        const templateSelect = document.getElementById('templateNo');
        templateSelect.innerHTML = '<option value="">画像なし</option>';

        const dbTemplateImages = masterData.templateImages || [];
        if (dbTemplateImages.length > 0) {
            // カテゴリごとにグループ化
            const categories = {};
            dbTemplateImages.forEach(ti => {
                const cat = ti.category || '未分類';
                if (!categories[cat]) categories[cat] = [];
                categories[cat].push(ti);
            });

            Object.entries(categories).forEach(([category, images]) => {
                const optgroup = document.createElement('optgroup');
                optgroup.label = category;
                images.forEach(ti => {
                    const option = document.createElement('option');
                    option.value = ti.image_key;
                    option.textContent = ti.display_name;
                    option.dataset.imageUrl = ti.image_url;
                    optgroup.appendChild(option);
                });
                templateSelect.appendChild(optgroup);
            });
        } else {
            // フォールバック: ハードコードされたテンプレート画像
            Object.entries(templateImages).forEach(([key, label]) => {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = label;
                templateSelect.appendChild(option);
            });
        }

        // プレビュー更新イベント
        templateSelect.onchange = () => updateTemplatePreviewWithMasterData(templateSelect, masterData);

        if (data) {
            document.getElementById('inspectionName').value = data.inspection_name || '';
            categorySelect.value = data.category || '';

            // 日時プレフィックス付きの場合（例: "1124 235959cleaning"）、キーを抽出
            let templateKeyForSelect = data.template_no || '';
            const allKeys = dbTemplateImages.length > 0
                ? dbTemplateImages.map(ti => ti.image_key)
                : Object.keys(templateImages);
            if (templateKeyForSelect && !allKeys.includes(templateKeyForSelect)) {
                for (const key of allKeys) {
                    if (templateKeyForSelect.endsWith(key)) {
                        templateKeyForSelect = key;
                        break;
                    }
                }
            }
            templateSelect.value = templateKeyForSelect;

            document.getElementById('noticeText').value = data.notice_text || '';
            document.getElementById('showOnBoard').checked = data.show_on_board !== false;
            updateTemplatePreviewWithMasterData(templateSelect, masterData);
        } else {
            document.getElementById('inspectionName').value = '';
            categorySelect.value = '';
            templateSelect.value = '';
            document.getElementById('noticeText').value = '';
            document.getElementById('showOnBoard').checked = true;
            updateTemplatePreviewWithMasterData(templateSelect, masterData);
        }
    } else if (type === 'category') {
        const section = document.getElementById('categoryFields');
        section.style.display = 'block';
        section.querySelectorAll('input, select, textarea').forEach(el => el.disabled = false);
        title.textContent = data ? 'カテゴリを編集' : 'カテゴリを追加';
        if (data) {
            document.getElementById('categoryName').value = data.category_name || '';
            document.getElementById('categorySortOrder').value = data.sort_order || 0;
        } else {
            document.getElementById('categoryName').value = '';
            document.getElementById('categorySortOrder').value = 0;
        }
    } else if (type === 'templateImage') {
        const section = document.getElementById('templateImageFields');
        section.style.display = 'block';
        section.querySelectorAll('input, select, textarea').forEach(el => el.disabled = false);
        title.textContent = data ? 'テンプレート画像を編集' : 'テンプレート画像を追加';

        // カテゴリードロップダウンを構築
        const categorySelect = document.getElementById('templateImageCategory');
        categorySelect.innerHTML = '<option value="">カテゴリを選択</option>';
        (masterData.categories || []).forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.category_name;
            option.textContent = cat.category_name;
            categorySelect.appendChild(option);
        });

        const fileInput = document.getElementById('templateImageFile');
        const previewDiv = document.getElementById('templateImagePreview');

        // ファイル選択時のプレビュー更新
        fileInput.onchange = () => {
            const file = fileInput.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    previewDiv.innerHTML = `<img src="${e.target.result}" alt="プレビュー" style="max-height: 150px; max-width: 100%; border-radius: 4px;">`;
                };
                reader.readAsDataURL(file);
            } else {
                previewDiv.innerHTML = '<span style="color: #94a3b8; font-size: 0.875rem;">画像を選択するとプレビュー表示</span>';
            }
        };

        if (data) {
            document.getElementById('templateImageKey').value = data.image_key || '';
            document.getElementById('templateImageDisplayName').value = data.display_name || '';
            document.getElementById('templateImageCategory').value = data.category || '';
            document.getElementById('templateImageSortOrder').value = data.sort_order || 0;
            // 編集時は画像ファイルは必須ではない（変更しない場合）
            fileInput.required = false;
            // 既存画像のプレビュー表示
            if (data.image_url) {
                previewDiv.innerHTML = `<img src="${escapeHtml(data.image_url)}" alt="${escapeHtml(data.display_name)}" style="max-height: 150px; max-width: 100%; border-radius: 4px;" onerror="this.parentElement.innerHTML='<span style=\\'color: #ef4444;\\'>画像が読み込めません</span>'">`;
            }
        } else {
            document.getElementById('templateImageKey').value = '';
            document.getElementById('templateImageDisplayName').value = '';
            document.getElementById('templateImageCategory').value = '';
            document.getElementById('templateImageSortOrder').value = 0;
            fileInput.required = true;
            fileInput.value = '';
            previewDiv.innerHTML = '<span style="color: #94a3b8; font-size: 0.875rem;">画像を選択するとプレビュー表示</span>';
        }
    }

    modal.classList.add('active');
}

export function closeMasterModal() {
    document.getElementById('masterModal').classList.remove('active');
    document.getElementById('masterForm').reset();
    updateTemplatePreview('');
}

export function updateTemplatePreview(templateKey) {
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

// DB対応版のプレビュー更新
export function updateTemplatePreviewWithMasterData(selectElement, masterData) {
    const preview = document.getElementById('templatePreview');
    if (!preview) return;

    const selectedOption = selectElement.selectedOptions[0];
    const templateKey = selectElement.value;

    if (!templateKey) {
        preview.innerHTML = '<span style="color: #94a3b8; font-size: 0.875rem;">プレビュー</span>';
        return;
    }

    // 選択されたオプションにdata-imageUrlがあればそれを使用（DB画像）
    const imageUrl = selectedOption?.dataset?.imageUrl;
    if (imageUrl) {
        preview.innerHTML = `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(selectedOption.textContent)}" style="max-height: 120px; max-width: 100%; border-radius: 4px;" onerror="this.parentElement.innerHTML='<span style=\\'color: #ef4444; font-size: 0.875rem;\\'>画像が見つかりません</span>'">`;
        return;
    }

    // DBテンプレート画像から検索
    const dbTemplateImages = masterData.templateImages || [];
    const dbImage = dbTemplateImages.find(ti => ti.image_key === templateKey);
    if (dbImage) {
        preview.innerHTML = `<img src="${escapeHtml(dbImage.image_url)}" alt="${escapeHtml(dbImage.display_name)}" style="max-height: 120px; max-width: 100%; border-radius: 4px;" onerror="this.parentElement.innerHTML='<span style=\\'color: #ef4444; font-size: 0.875rem;\\'>画像が見つかりません</span>'">`;
        return;
    }

    // フォールバック: ハードコードされたテンプレート画像
    let matchedKey = templateKey;
    if (!templateImages[templateKey]) {
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

// ========================================
// マスターフォーム送信
// ========================================

export async function handleMasterFormSubmit(e, masterData, showToast, updateStats) {
    e.preventDefault();

    const type = document.getElementById('masterType').value;
    const id = document.getElementById('masterId').value;

    try {
        if (type === 'property') {
            // 端末リストを収集
            const terminalItems = document.querySelectorAll('#terminalsList .terminal-item');
            const terminals = Array.from(terminalItems).map(item => ({
                terminal_id: item.querySelector('.terminal-id').value,
                supplement: item.querySelector('.terminal-supplement').value || ''
            }));

            const data = {
                property_code: parseInt(document.getElementById('propertyCode').value),
                property_name: document.getElementById('propertyName').value,
                terminals: terminals,
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
                showToast('保守会社を更新しました', 'success');
            } else {
                await addVendor(data);
                showToast('保守会社を追加しました', 'success');
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
        } else if (type === 'templateImage') {
            const imageKey = document.getElementById('templateImageKey').value;
            const displayName = document.getElementById('templateImageDisplayName').value;
            const category = document.getElementById('templateImageCategory').value;
            const sortOrder = parseInt(document.getElementById('templateImageSortOrder').value) || 0;
            const fileInput = document.getElementById('templateImageFile');
            const file = fileInput.files[0];

            let imageUrl = null;

            // 新規追加時はファイル必須
            if (!id && !file) {
                showToast('画像ファイルを選択してください', 'error');
                return false;
            }

            // ファイルがある場合はアップロード
            if (file) {
                try {
                    imageUrl = await uploadTemplateImageFile(file, imageKey);
                } catch (uploadError) {
                    showToast(`画像のアップロードに失敗しました: ${uploadError.message}`, 'error');
                    return false;
                }
            }

            const data = {
                image_key: imageKey,
                display_name: displayName,
                category: category || null,
                sort_order: sortOrder,
            };

            // 新しい画像URLがある場合は追加
            if (imageUrl) {
                data.image_url = imageUrl;
            }

            if (id) {
                await updateTemplateImage(id, data);
                showToast('テンプレート画像を更新しました', 'success');
            } else {
                // 新規追加時はimage_urlが必須
                if (!data.image_url) {
                    showToast('画像のアップロードに失敗しました', 'error');
                    return false;
                }
                await addTemplateImage(data);
                showToast('テンプレート画像を追加しました', 'success');
            }
        }

        closeMasterModal();
        // マスターデータを再読み込み
        const newMasterData = await getAllMasterData();
        Object.assign(masterData, newMasterData);
        loadMasterData(masterData);
        updateStats();
        return true;
    } catch (error) {
        console.error('Failed to save master data:', error);
        showToast('保存に失敗しました', 'error');
        return false;
    }
}

// ========================================
// マスター削除
// ========================================

export async function deleteMasterPropertyAction(id, masterData, entries, showToast, updateStats) {
    const property = masterData.properties.find(p => p.id === id);
    if (property) {
        const usedEntries = entries.filter(e => e.property_code === property.property_code);
        if (usedEntries.length > 0) {
            showToast(`この物件は${usedEntries.length}件のエントリで使用中です`, 'error');
            return false;
        }
    }
    if (!confirm('この物件を削除しますか？')) return false;
    try {
        await deleteProperty(id);
        showToast('物件を削除しました', 'success');
        const newMasterData = await getAllMasterData();
        Object.assign(masterData, newMasterData);
        loadMasterData(masterData);
        updateStats();
        return true;
    } catch (error) {
        showToast('削除に失敗しました', 'error');
        return false;
    }
}

export async function deleteMasterVendorAction(id, masterData, showToast) {
    if (!confirm('この保守会社を削除しますか？')) return false;
    try {
        await deleteVendor(id);
        showToast('保守会社を削除しました', 'success');
        const newMasterData = await getAllMasterData();
        Object.assign(masterData, newMasterData);
        loadMasterData(masterData);
        return true;
    } catch (error) {
        showToast('削除に失敗しました', 'error');
        return false;
    }
}

export async function deleteMasterInspectionAction(id, masterData, entries, showToast) {
    const inspection = masterData.inspectionTypes.find(i => i.id === id);
    if (inspection) {
        const usedEntries = entries.filter(e => e.inspection_type === inspection.inspection_name);
        if (usedEntries.length > 0) {
            showToast(`この点検種別は${usedEntries.length}件のエントリで使用中です`, 'error');
            return false;
        }
    }
    if (!confirm('この点検種別を削除しますか？')) return false;
    try {
        await deleteInspectionType(id);
        showToast('点検種別を削除しました', 'success');
        const newMasterData = await getAllMasterData();
        Object.assign(masterData, newMasterData);
        loadMasterData(masterData);
        return true;
    } catch (error) {
        showToast('削除に失敗しました', 'error');
        return false;
    }
}

export async function deleteMasterCategoryAction(id, masterData, showToast) {
    if (!confirm('このカテゴリを削除しますか？')) return false;
    try {
        await deleteCategory(id);
        showToast('カテゴリを削除しました', 'success');
        await loadCategories(masterData);
        return true;
    } catch (error) {
        showToast('削除に失敗しました', 'error');
        return false;
    }
}

export async function deleteMasterTemplateImageAction(id, masterData, showToast) {
    const templateImage = (masterData.templateImages || []).find(ti => ti.id === id);
    if (!templateImage) {
        showToast('テンプレート画像が見つかりません', 'error');
        return false;
    }

    // 点検種別で使用中かチェック
    const usedInspections = (masterData.inspectionTypes || []).filter(i => i.template_no === templateImage.image_key);
    if (usedInspections.length > 0) {
        const names = usedInspections.map(i => i.inspection_name).join(', ');
        showToast(`この画像は点検種別で使用中です: ${names}`, 'error');
        return false;
    }

    if (!confirm(`テンプレート画像「${templateImage.display_name}」を削除しますか？\n※Storageの画像ファイルも削除されます`)) {
        return false;
    }

    try {
        // Storageから画像を削除
        try {
            await deleteTemplateImageFile(templateImage.image_key);
        } catch (storageError) {
            console.warn('Storage deletion failed (may not exist):', storageError);
            // Storageの削除に失敗しても続行
        }

        // DBレコードを削除
        await deleteTemplateImage(id);
        showToast('テンプレート画像を削除しました', 'success');

        // マスターデータを再読み込み
        const newMasterData = await getAllMasterData();
        Object.assign(masterData, newMasterData);
        renderTemplateImages(masterData);
        return true;
    } catch (error) {
        console.error('Failed to delete template image:', error);
        showToast('削除に失敗しました', 'error');
        return false;
    }
}
