// admin-relationships.js - 紐付け管理 + ビル追加リクエスト

import {
    getMasterVendors,
    getMasterProperties,
    getMasterInspectionTypes,
    getBuildingVendors,
    addBuildingVendor,
    removeBuildingVendor,
    getVendorInspections,
    addVendorInspection,
    removeVendorInspection,
    getPendingBuildingRequests,
    approveBuildingRequest,
    rejectBuildingRequest
} from './supabase-client.js';

import { escapeHtml, showToast } from './ui-utils.js';

let getState = null;
let setState = null;
let currentRelationshipType = 'buildings';

/**
 * 紐付け管理モジュール初期化
 * @param {Function} _getState - () => { masterData, pendingBuildingRequests, getUserEmail }
 * @param {Function} _setState - (key, value) => void
 */
export function initRelationshipsModule(_getState, _setState) {
    getState = _getState;
    setState = _setState;
}

export async function initRelationshipsTab() {
    const filterVendor = document.getElementById('relationshipVendorSelect');

    try {
        const vendors = await getMasterVendors();
        const options = ['<option value="">-- 選択してください --</option>'];
        vendors.forEach(v => {
            options.push(`<option value="${v.id}">${escapeHtml(v.vendor_name)}</option>`);
        });
        filterVendor.innerHTML = options.join('');
    } catch (error) {
        console.error('Failed to load vendors:', error);
    }

    filterVendor.addEventListener('change', async (e) => {
        const vendorId = e.target.value;
        if (!vendorId) {
            document.getElementById('relationshipSubTabs').style.display = 'none';
            document.getElementById('buildingRelationshipsContainer').style.display = 'none';
            document.getElementById('inspectionRelationshipsContainer').style.display = 'none';
            document.getElementById('relationshipsInitialMessage').style.display = 'block';
            return;
        }

        document.getElementById('relationshipSubTabs').style.display = 'flex';
        document.getElementById('relationshipsInitialMessage').style.display = 'none';

        try {
            await loadRelationships(vendorId, currentRelationshipType);
        } catch (error) {
            console.error('Failed to load relationships:', error);
            showToast('紐付けデータの取得に失敗しました', 'error');
        }
    });

    document.querySelectorAll('[data-rel-type]').forEach(tab => {
        tab.addEventListener('click', async () => {
            const relType = tab.dataset.relType;
            currentRelationshipType = relType;

            document.querySelectorAll('[data-rel-type]').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const vendorId = filterVendor.value;
            if (vendorId) {
                try {
                    await loadRelationships(vendorId, relType);
                } catch (error) {
                    console.error('Failed to load relationships:', error);
                    showToast('紐付けデータの取得に失敗しました', 'error');
                }
            }
        });
    });
}

async function loadRelationships(vendorId, type) {
    if (type === 'buildings') {
        document.getElementById('buildingRelationshipsContainer').style.display = 'block';
        document.getElementById('inspectionRelationshipsContainer').style.display = 'none';
        await loadBuildingVendorRelationships(vendorId);
    } else {
        document.getElementById('buildingRelationshipsContainer').style.display = 'none';
        document.getElementById('inspectionRelationshipsContainer').style.display = 'block';
        await loadVendorInspectionRelationships(vendorId);
    }
}

async function loadBuildingVendorRelationships(vendorId) {
    try {
        const [relationships, properties] = await Promise.all([
            getBuildingVendors({ vendorId }),
            getMasterProperties()
        ]);
        renderBuildingVendorRelationships(relationships, properties, vendorId);
    } catch (error) {
        console.error('Failed to load building-vendor relationships:', error);
        showToast('紐付け情報の読み込みに失敗しました', 'error');
    }
}

async function loadVendorInspectionRelationships(vendorId) {
    try {
        const relationships = await getVendorInspections(vendorId);
        renderVendorInspectionRelationships(relationships, vendorId);
    } catch (error) {
        console.error('Failed to load vendor-inspection relationships:', error);
        showToast('点検種別紐付け情報の読み込みに失敗しました', 'error');
    }
}

function renderBuildingVendorRelationships(relationships, properties, vendorId) {
    const container = document.getElementById('buildingRelationshipsContainer');
    const activeRelationships = relationships.filter(r => r.status === 'active');

    const propertiesMap = {};
    properties.forEach(p => {
        propertiesMap[p.property_code] = p.property_name;
    });

    container.innerHTML = `
        <div style="margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center;">
            <p style="color: #64748b; font-size: 0.875rem; margin: 0;">
                ${activeRelationships.length}件の物件が紐付けられています
            </p>
            <button class="btn btn-primary btn-sm" onclick="openAddBuildingModal('${vendorId}')">
                <span class="btn-icon">➕</span> ビルを追加
            </button>
        </div>
        ${activeRelationships.length === 0 ?
            '<p style="color: #64748b; text-align: center; padding: 2rem;">紐付けがありません</p>' :
            `<div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>物件コード</th>
                            <th>物件名</th>
                            <th>ステータス</th>
                            <th>登録日</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${activeRelationships.map(r => `
                            <tr>
                                <td>${escapeHtml(r.property_code)}</td>
                                <td>${escapeHtml(propertiesMap[r.property_code] || '-')}</td>
                                <td><span class="status-badge status-active">有効</span></td>
                                <td>${new Date(r.created_at).toLocaleDateString('ja-JP')}</td>
                                <td style="display: flex; gap: 0.5rem;">
                                    <button class="btn btn-outline btn-sm btn-equipment" onclick="openEquipmentModal('${r.property_code}', '${escapeHtml(propertiesMap[r.property_code] || r.property_code)}')">🔧 設備</button>
                                    <button class="btn btn-danger btn-sm" onclick="handleRemoveBuildingVendor('${r.id}')">削除</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>`
        }
    `;
}

function renderVendorInspectionRelationships(relationships, vendorId) {
    const container = document.getElementById('inspectionRelationshipsContainer');

    container.innerHTML = `
        <div style="margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center;">
            <p style="color: #64748b; font-size: 0.875rem; margin: 0;">
                ${relationships.length}件の点検種別が紐付けられています
            </p>
            <button class="btn btn-primary btn-sm" onclick="openAddInspectionModal('${vendorId}')">
                <span class="btn-icon">➕</span> 点検種別を追加
            </button>
        </div>
        ${relationships.length === 0 ?
            '<p style="color: #64748b; text-align: center; padding: 2rem;">紐付けがありません</p>' :
            `<div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>点検種別</th>
                            <th>カテゴリID</th>
                            <th>ステータス</th>
                            <th>登録日</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${relationships.map(r => `
                            <tr>
                                <td>${escapeHtml(r.signage_master_inspection_types?.inspection_name || '-')}</td>
                                <td>${escapeHtml(r.signage_master_inspection_types?.category || '-')}</td>
                                <td><span class="status-badge status-active">有効</span></td>
                                <td>${new Date(r.created_at).toLocaleDateString('ja-JP')}</td>
                                <td>
                                    <button class="btn btn-danger btn-sm" onclick="handleRemoveVendorInspection('${r.id}')">削除</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>`
        }
    `;
}

export async function openAddBuildingModal(vendorId) {
    const propertyCode = prompt('追加する物件コードを入力してください:');
    if (!propertyCode) return;

    try {
        await addBuildingVendor(propertyCode, vendorId);
        showToast('ビルを追加しました', 'success');
        await loadBuildingVendorRelationships(vendorId);
    } catch (error) {
        console.error('Failed to add building-vendor relationship:', error);
        if (error.message.includes('duplicate') || error.message.includes('unique')) {
            showToast('この物件は既に追加されています', 'error');
        } else if (error.message.includes('foreign key') || error.message.includes('not found')) {
            showToast('物件コードが見つかりません', 'error');
        } else {
            showToast('追加に失敗しました: ' + error.message, 'error');
        }
    }
}

export async function openAddInspectionModal(vendorId) {
    try {
        const [allInspections, linkedInspections] = await Promise.all([
            getMasterInspectionTypes(),
            getVendorInspections(vendorId)
        ]);

        const linkedIds = new Set(linkedInspections.map(r => r.inspection_id));
        const availableInspections = allInspections.filter(i => !linkedIds.has(i.id));

        if (availableInspections.length === 0) {
            showToast('すべての点検種別が既に紐付けられています', 'info');
            return;
        }

        const grid = document.getElementById('inspectionSelectGrid');
        const countSpan = document.getElementById('inspectionSelectCount');
        const confirmBtn = document.getElementById('inspectionSelectConfirmBtn');

        // ピルボタンを生成
        grid.innerHTML = availableInspections.map(i =>
            `<button type="button" class="inspection-select-btn" data-inspection-id="${i.id}">${escapeHtml(i.inspection_name)}</button>`
        ).join('');

        // 選択状態の管理
        const updateCount = () => {
            const selectedCount = grid.querySelectorAll('.inspection-select-btn.selected').length;
            countSpan.textContent = `${selectedCount}件選択中`;
            confirmBtn.disabled = selectedCount === 0;
        };

        // クリックでトグル
        grid.querySelectorAll('.inspection-select-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.classList.toggle('selected');
                updateCount();
            });
        });

        // 確認ボタン
        confirmBtn.onclick = () => {
            const ids = Array.from(grid.querySelectorAll('.inspection-select-btn.selected'))
                .map(btn => btn.dataset.inspectionId);
            confirmInspectionSelection(vendorId, ids);
        };

        // 初期状態リセット
        updateCount();

        // モーダル表示
        document.getElementById('inspectionSelectModal').classList.add('active');
    } catch (error) {
        console.error('Failed to open inspection select modal:', error);
        showToast('点検種別の取得に失敗しました', 'error');
    }
}

export function closeInspectionSelectModal() {
    document.getElementById('inspectionSelectModal').classList.remove('active');
}

async function confirmInspectionSelection(vendorId, selectedIds) {
    if (selectedIds.length === 0) return;

    closeInspectionSelectModal();

    try {
        const results = await Promise.allSettled(
            selectedIds.map(id => addVendorInspection(vendorId, id))
        );
        const succeeded = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected');

        if (failed.length === 0) {
            showToast(`${succeeded}件の点検種別を追加しました`, 'success');
        } else if (succeeded > 0) {
            showToast(`${succeeded}件追加、${failed.length}件失敗`, 'error');
        } else {
            const reason = failed[0].reason?.message || '';
            if (reason.includes('duplicate') || reason.includes('unique')) {
                showToast('一部の点検種別は既に追加されています', 'error');
            } else {
                showToast('追加に失敗しました: ' + reason, 'error');
            }
        }
    } catch (error) {
        console.error('Failed to add vendor-inspection relationships:', error);
        showToast('追加に失敗しました', 'error');
    } finally {
        await loadVendorInspectionRelationships(vendorId);
    }
}

export async function handleRemoveBuildingVendor(relationshipId) {
    if (!confirm('この紐付けを削除してもよろしいですか？')) return;

    try {
        await removeBuildingVendor(relationshipId);
        showToast('紐付けを削除しました', 'success');
        const vendorId = document.getElementById('relationshipVendorSelect').value;
        if (vendorId) {
            await loadBuildingVendorRelationships(vendorId);
        }
    } catch (error) {
        console.error('Failed to remove building-vendor relationship:', error);
        showToast('削除に失敗しました', 'error');
    }
}

export async function handleRemoveVendorInspection(relationshipId) {
    if (!confirm('この点検種別の紐付けを削除してもよろしいですか？')) return;

    try {
        await removeVendorInspection(relationshipId);
        showToast('紐付けを削除しました', 'success');
        const vendorId = document.getElementById('relationshipVendorSelect').value;
        if (vendorId) {
            await loadVendorInspectionRelationships(vendorId);
        }
    } catch (error) {
        console.error('Failed to remove vendor-inspection relationship:', error);
        showToast('削除に失敗しました', 'error');
    }
}

export async function loadPendingBuildingRequests() {
    try {
        const requests = await getPendingBuildingRequests();
        setState('pendingBuildingRequests', requests);
        renderPendingBuildingRequests();
    } catch (error) {
        console.error('Failed to load pending building requests:', error);
    }
}

function renderPendingBuildingRequests() {
    const { pendingBuildingRequests, masterData, getUserEmail } = getState();
    const tbody = document.getElementById('pendingBuildingsBody');
    const emptyMsg = document.getElementById('pendingBuildingsEmpty');
    const countSpan = document.getElementById('pendingBuildingCount');

    countSpan.textContent = pendingBuildingRequests.length;

    if (pendingBuildingRequests.length === 0) {
        tbody.innerHTML = '';
        emptyMsg.style.display = 'block';
        return;
    }

    emptyMsg.style.display = 'none';
    tbody.innerHTML = pendingBuildingRequests.map(req => {
        const property = masterData.properties.find(p => String(p.property_code) === String(req.property_code));
        const propertyName = property?.property_name || '-';
        return `
        <tr>
            <td>${escapeHtml(req.property_code)}</td>
            <td>${escapeHtml(propertyName)}</td>
            <td>${escapeHtml(req.signage_master_vendors?.vendor_name || '-')}</td>
            <td>${getUserEmail(req.requested_by)}</td>
            <td>${new Date(req.created_at).toLocaleString('ja-JP')}</td>
            <td>
                <button class="btn btn-success btn-sm" onclick="handleApproveBuildingRequest('${req.id}')">承認</button>
                <button class="btn btn-danger btn-sm" onclick="handleRejectBuildingRequest('${req.id}')">却下</button>
            </td>
        </tr>
    `;}).join('');
}

export async function handleApproveBuildingRequest(requestId) {
    try {
        await approveBuildingRequest(requestId);
        showToast('ビル追加リクエストを承認しました', 'success');
        await loadPendingBuildingRequests();
    } catch (error) {
        console.error('Failed to approve building request:', error);
        showToast('承認に失敗しました', 'error');
    }
}

export async function handleRejectBuildingRequest(requestId) {
    if (!confirm('このリクエストを却下してもよろしいですか？')) return;

    try {
        await rejectBuildingRequest(requestId);
        showToast('ビル追加リクエストを却下しました', 'success');
        await loadPendingBuildingRequests();
    } catch (error) {
        console.error('Failed to reject building request:', error);
        showToast('却下に失敗しました', 'error');
    }
}
