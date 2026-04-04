// csv-generator.js - CSV生成・ダウンロード・プレビュー
// script.js から分離。entries は window._entries 経由で参照。

function generateCSV() {
    const entries = window._entries || [];
    const normalizeTerminalId = window.normalizeTerminalId || ((id) => id || '');
    const headers = window.CSV_HEADERS || ['点検CO','端末ID','物件コード','保守会社名','緊急連絡先番号','点検工事案内','掲示板に表示する','点検案内TPLNo','点検開始日','点検完了日','掲示備考','掲示板用案内文','frame_No','表示開始日','表示終了日','表示開始時刻','表示終了時刻','表示時間','統合ポリシー','制御','変更日','変更時刻','最終エクスポート日時','ID','変更日時','点検日時','表示日時','貼紙区分'];
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '/');
    const timeStr = now.toTimeString().substring(0, 8);

    const rows = entries.map(e => {
        const sd = e.startDate ? e.startDate.replace(/-/g, '/') : '';
        const ed = e.endDate ? e.endDate.replace(/-/g, '/') : sd;
        const dsd = e.displayStartDate ? e.displayStartDate.replace(/-/g, '/') : '';
        const ded = e.displayEndDate ? e.displayEndDate.replace(/-/g, '/') : ed;
        const dt = `0:00:${String(e.displayTime).padStart(2, '0')}`;
        return ['', normalizeTerminalId(e.terminalId), e.propertyCode, e.vendorName, e.emergencyContact, e.inspectionType, e.showOnBoard ? 'TRUE' : 'False', e.templateNo, sd, ed, e.remarks.replace(/\n/g, '\r\n'), e.noticeText.replace(/\n/g, '\r\n'), e.frameNo !== undefined ? String(e.frameNo) : '2', dsd, ded, e.displayStartTime || '', e.displayEndTime || '', dt, '', '', dateStr, '', '', '', `${dateStr} [${timeStr}]`, `${sd} [00:00:00]`, `${dsd} [00:00:00]`, e.posterType === 'template' ? 'テンプレート' : '追加'];
    });

    const esc = window.escapeCSVField || (v => {
        if (v == null) return '';
        const s = String(v);
        return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s;
    });
    return [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
}

function downloadCSV() {
    const entries = window._entries || [];
    const csv = generateCSV();
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8' });
    const now = new Date();
    const ts = now.toISOString().replace(/[-:]/g, '').substring(0, 15);
    const code = entries[0]?.propertyCode || 'export';
    const filename = `${code}-全端末-${ts}.csv`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    showToast(`${filename} をダウンロード`, 'success');
}

function previewCSV() {
    document.getElementById('csvPreview').textContent = generateCSV();
    document.getElementById('previewModal').classList.add('active');
}

function closeModal(e) {
    if (!e || e.target === e.currentTarget) {
        document.getElementById('previewModal').classList.remove('active');
    }
}

async function copyCSV() {
    try {
        await navigator.clipboard.writeText(generateCSV());
        showToast('コピーしました', 'success');
    } catch { showToast('コピー失敗', 'error'); }
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// window に公開
window.generateCSV = generateCSV;
window.downloadCSV = downloadCSV;
window.previewCSV = previewCSV;
window.copyCSV = copyCSV;
window.closeModal = closeModal;
