// admin-equipment.js - 建物設備管理

import {
    getBuildingEquipment,
    addBuildingEquipment,
    deleteBuildingEquipment
} from './supabase-client.js';

import { escapeHtml, showToast } from './ui-utils.js';

let getState = null;
let currentEquipmentPropertyCode = null;

/**
 * 設備管理モジュール初期化
 * @param {Function} _getState - () => { masterData }
 */
export function initEquipmentModule(_getState) {
    getState = _getState;
}

// フォームリセット
function resetEquipmentForm() {
    ['equipmentType', 'equipmentVendor', 'equipmentRemarks', 'equipmentRemarks2'].forEach(id => {
        document.getElementById(id).value = '';
    });
    document.querySelectorAll('#monthCheckboxes input').forEach(cb => cb.checked = false);
}

/**
 * 設備モーダルを開く
 * @param {string} propertyCode - 物件コード
 * @param {string} propertyName - 物件名
 */
export async function openEquipmentModal(propertyCode, propertyName) {
    const { masterData } = getState();
    currentEquipmentPropertyCode = propertyCode;
    document.getElementById('equipmentModalTitle').textContent = `設備情報 - ${propertyName}`;
    document.getElementById('equipmentModal').classList.add('active');

    // セレクトボックス初期化
    document.getElementById('equipmentType').innerHTML = '<option value="">選択...</option>' +
        masterData.inspectionTypes.filter(t => t.category === '点検')
            .map(t => `<option value="${t.id}">${escapeHtml(t.inspection_name)}</option>`).join('');
    document.getElementById('equipmentVendor').innerHTML = '<option value="">なし</option>' +
        masterData.vendors.map(v => `<option value="${v.id}">${escapeHtml(v.vendor_name)}</option>`).join('');

    await loadEquipmentList();
}

/**
 * 設備モーダルを閉じる
 */
export function closeEquipmentModal() {
    document.getElementById('equipmentModal').classList.remove('active');
    currentEquipmentPropertyCode = null;
    resetEquipmentForm();
}

/**
 * 設備一覧を読み込み
 */
async function loadEquipmentList() {
    const { masterData } = getState();
    try {
        const equipment = await getBuildingEquipment(currentEquipmentPropertyCode);
        const tbody = document.getElementById('equipmentTableBody');
        const emptyMsg = document.getElementById('equipmentEmptyMessage');

        if (!equipment?.length) {
            tbody.innerHTML = '';
            emptyMsg.style.display = 'block';
            return;
        }

        emptyMsg.style.display = 'none';
        tbody.innerHTML = equipment.map(eq => {
            const inspType = masterData.inspectionTypes.find(t => t.id === eq.inspection_type_id);
            const vendor = masterData.vendors.find(v => v.id === eq.vendor_id);
            return `
            <tr>
                <td>${escapeHtml(inspType?.inspection_name || '-')}</td>
                <td>${escapeHtml(vendor?.vendor_name || '-')}</td>
                <td>${eq.inspection_months?.length ? eq.inspection_months.map(m => `${m}月`).join(', ') : '-'}</td>
                <td>${escapeHtml(eq.remarks || '')}</td>
                <td>${escapeHtml(eq.remarks2 || '')}</td>
                <td><button class="btn btn-danger btn-sm" onclick="deleteEquipmentRow('${eq.id}')">削除</button></td>
            </tr>
        `}).join('');
    } catch (error) {
        console.error('Failed to load equipment:', error);
        showToast('設備情報の読み込みに失敗しました', 'error');
    }
}

/**
 * 設備を追加
 */
export async function addEquipment() {
    const typeId = document.getElementById('equipmentType').value;
    if (!typeId) {
        showToast('設備種類を選択してください', 'error');
        return;
    }

    const months = [...document.querySelectorAll('#monthCheckboxes input:checked')].map(cb => parseInt(cb.value));

    try {
        await addBuildingEquipment({
            property_code: currentEquipmentPropertyCode,
            inspection_type_id: typeId,
            vendor_id: document.getElementById('equipmentVendor').value || null,
            inspection_months: months,
            remarks: document.getElementById('equipmentRemarks').value,
            remarks2: document.getElementById('equipmentRemarks2').value
        });
        showToast('設備を追加しました', 'success');
        resetEquipmentForm();
        await loadEquipmentList();
    } catch (error) {
        console.error('Failed to add equipment:', error);
        showToast('設備の追加に失敗しました: ' + error.message, 'error');
    }
}

/**
 * 設備を削除
 * @param {string} id - 設備ID
 */
export async function deleteEquipmentRow(id) {
    if (!confirm('この設備を削除してもよろしいですか？')) return;
    try {
        await deleteBuildingEquipment(id);
        showToast('設備を削除しました', 'success');
        await loadEquipmentList();
    } catch (error) {
        console.error('Failed to delete equipment:', error);
        showToast('設備の削除に失敗しました', 'error');
    }
}
