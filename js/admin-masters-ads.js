// admin-masters-ads.js - 広告枠管理 (v1.24.0)
// admin-masters.js から分離

import { getAdSlots, upsertAdSlot, uploadAdImage } from './supabase-client.js';
import { escapeHtml } from './ui-utils.js';

let _adSlots = [];
let _currentEditSlotIndex = null;
let _adminShowToast = null;

export async function initAdSlotsAdmin(showToast) {
    _adminShowToast = showToast;
    await loadAdSlotsAdmin();
    setupAdSlotModal();
}

async function loadAdSlotsAdmin() {
    try {
        _adSlots = await getAdSlots();
        renderAdSlotsGrid(_adSlots);
    } catch (e) {
        console.error('広告枠読み込みエラー:', e);
        if (_adminShowToast) _adminShowToast('広告枠の読み込みに失敗しました', 'error');
    }
}

function renderAdSlotsGrid(slots) {
    const grid = document.getElementById('adSlotsGrid');
    if (!grid) return;

    // スロットをインデックスでマップ化
    const slotMap = Object.fromEntries(slots.map(s => [s.slot_index, s]));

    // セル 0: ログイン（固定・編集不可）
    const loginCell = `
        <div style="border-radius:10px; overflow:hidden; background:linear-gradient(135deg,#667eea,#764ba2); display:flex; align-items:center; justify-content:center; min-height:160px;">
            <div style="text-align:center; color:white; padding:1rem;">
                <div style="font-size:1.5rem; margin-bottom:0.5rem;">🔐</div>
                <div style="font-size:0.75rem; font-weight:600; opacity:0.9;">ログイン画面</div>
                <div style="font-size:0.625rem; opacity:0.7; margin-top:0.25rem;">（変更不可）</div>
            </div>
        </div>`;

    // セル 1〜3: 各広告枠
    const adCells = [1,2,3].map(idx => {
        const slot = slotMap[idx];
        const isActive = slot?.is_active;
        const hasImage = !!slot?.image_url;
        return `
            <div style="border-radius:10px; overflow:hidden; background:white; display:flex; flex-direction:column; min-height:160px; cursor:pointer; transition:box-shadow 0.15s;"
                 onclick="window.openAdSlotModal(${idx})"
                 onmouseenter="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.15)'"
                 onmouseleave="this.style.boxShadow='none'">
                <!-- サムネイル -->
                <div style="flex:1; background:#f1f5f9; display:flex; align-items:center; justify-content:center; overflow:hidden; position:relative;">
                    ${hasImage
                        ? `<img src="${escapeHtml(slot.image_url)}" style="width:100%;height:100%;object-fit:cover;" alt="">`
                        : ''}
                    <!-- スロット番号バッジ -->
                    <span style="position:absolute; top:6px; left:6px; background:rgba(0,0,0,0.5); color:white; font-size:0.65rem; font-weight:700; padding:2px 6px; border-radius:999px;">${idx}</span>
                    <!-- ON/OFFバッジ -->
                    <span style="position:absolute; top:6px; right:6px; font-size:0.65rem; font-weight:700; padding:2px 6px; border-radius:999px; background:${isActive ? '#dcfce7' : '#f1f5f9'}; color:${isActive ? '#16a34a' : '#94a3b8'};">
                        ${isActive ? '表示中' : '非表示'}
                    </span>
                </div>
                <!-- フッター -->
                <div style="padding:0.5rem 0.75rem; border-top:1px solid #f1f5f9; background:white;">
                    <p style="margin:0; font-size:0.75rem; color:${slot?.caption ? '#475569' : '#cbd5e1'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${slot?.caption ? escapeHtml(slot.caption) : 'キャプションなし'}
                    </p>
                </div>
            </div>`;
    });

    grid.innerHTML = loginCell + adCells.join('');
}

function setupAdSlotModal() {
    const modal = document.getElementById('adSlotModal');
    if (!modal) return;

    document.getElementById('adSlotModalClose').addEventListener('click', closeAdSlotModal);
    document.getElementById('adSlotCancelBtn').addEventListener('click', closeAdSlotModal);
    document.getElementById('adSlotSaveBtn').addEventListener('click', saveAdSlot);

    // モーダル外クリックで閉じる
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeAdSlotModal();
    });
}

window.openAdSlotModal = function(slotIndex) {
    _currentEditSlotIndex = slotIndex;
    const slot = _adSlots.find(s => s.slot_index === slotIndex);
    if (!slot) return;

    document.getElementById('adSlotIndex').value = slotIndex;
    document.getElementById('adSlotCaption').value = slot.caption || '';
    document.getElementById('adSlotLinkUrl').value = slot.link_url || '';
    document.getElementById('adSlotIsActive').checked = slot.is_active || false;
    document.getElementById('adSlotImageFile').value = '';

    const preview = document.getElementById('adSlotImagePreview');
    preview.innerHTML = slot.image_url
        ? `<img src="${escapeHtml(slot.image_url)}">`
        : '<span class="no-image">画像未設定</span>';

    document.getElementById('adSlotModalTitle').textContent = `広告枠 ${slotIndex} 編集`;
    const modal = document.getElementById('adSlotModal');
    modal.classList.add('active');
};

function closeAdSlotModal() {
    const modal = document.getElementById('adSlotModal');
    if (modal) modal.classList.remove('active');
    _currentEditSlotIndex = null;
}

async function saveAdSlot() {
    if (_currentEditSlotIndex === null) return;

    const saveBtn = document.getElementById('adSlotSaveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';

    try {
        const slotIndex = _currentEditSlotIndex;
        const slot = _adSlots.find(s => s.slot_index === slotIndex);
        const caption = document.getElementById('adSlotCaption').value.trim();
        const linkUrl = document.getElementById('adSlotLinkUrl').value.trim();
        const isActive = document.getElementById('adSlotIsActive').checked;
        const imageFile = document.getElementById('adSlotImageFile').files[0];

        let imageUrl = slot ? slot.image_url : null;

        // 画像アップロード
        if (imageFile) {
            imageUrl = await uploadAdImage(imageFile, slotIndex);
        }

        await upsertAdSlot(slotIndex, { imageUrl, caption, linkUrl, isActive });

        if (_adminShowToast) _adminShowToast('広告枠を保存しました', 'success');
        closeAdSlotModal();
        await loadAdSlotsAdmin();
    } catch (e) {
        console.error('広告枠保存エラー:', e);
        if (_adminShowToast) _adminShowToast('保存に失敗しました: ' + e.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存';
    }
}
