        let entries = [];
        let editingIndex = -1;
        let currentPosition = 2;
        let currentTemplateNo = '';

        function init() {
            populatePropertySelect();
            populateVendorSelect();
            populateInspectionTypeSelect();
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('startDate').value = today;
            document.getElementById('displayStartDate').value = today;
            updatePreview();
        }

        function populatePropertySelect() {
            const select = document.getElementById('property');
            const seen = new Set();
            masterData.properties.forEach(p => {
                if (!seen.has(p.propertyCode)) {
                    seen.add(p.propertyCode);
                    const opt = document.createElement('option');
                    opt.value = p.propertyCode;
                    opt.textContent = `${p.propertyCode} ${p.propertyName}`;
                    select.appendChild(opt);
                }
            });
        }

        function onPropertyChange() {
            const code = parseInt(document.getElementById('property').value);
            const terminalSelect = document.getElementById('terminal');
            terminalSelect.innerHTML = '<option value="">選択してください</option>';
            if (code) {
                const terminals = masterData.properties.filter(p => p.propertyCode === code);
                terminals.forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = t.terminalId;
                    opt.textContent = t.supplement ? `${t.terminalId} (${t.supplement})` : t.terminalId;
                    terminalSelect.appendChild(opt);
                });
                if (terminals.length > 0) terminalSelect.value = terminals[0].terminalId;
            }
        }

        function populateVendorSelect() {
            const select = document.getElementById('vendor');
            masterData.vendors.forEach((v, i) => {
                const opt = document.createElement('option');
                opt.value = i;
                opt.textContent = v.vendorName;
                select.appendChild(opt);
            });
        }

        function onVendorChange() {
            const idx = document.getElementById('vendor').value;
            document.getElementById('emergencyContact').value = idx !== '' ? masterData.vendors[idx].emergencyContact : '';
        }

        function populateInspectionTypeSelect() {
            const select = document.getElementById('inspectionType');
            masterData.notices.forEach((n, i) => {
                const opt = document.createElement('option');
                opt.value = i;
                opt.textContent = n.inspectionType;
                select.appendChild(opt);
            });
        }

        function onInspectionTypeChange() {
            const idx = document.getElementById('inspectionType').value;
            if (idx !== '') {
                const notice = masterData.notices[idx];
                document.getElementById('showOnBoard').checked = notice.showOnBoard;
                document.getElementById('noticeText').value = notice.noticeText;
                currentTemplateNo = notice.templateNo;
            } else {
                currentTemplateNo = '';
            }
            updatePreview();
        }

        function adjustTime(delta) {
            const input = document.getElementById('displayTime');
            let val = parseInt(input.value) || 6;
            input.value = Math.max(1, Math.min(30, val + delta));
        }

        function setPosition(pos) {
            currentPosition = pos;
            document.querySelectorAll('.position-cell').forEach(cell => {
                cell.classList.toggle('active', parseInt(cell.dataset.pos) === pos);
            });
        }

        function updatePreview() {
            const container = document.getElementById('posterPreview');
            const imgData = templateImages[currentTemplateNo];
            const noticeText = document.getElementById('noticeText').value;
            const startDate = document.getElementById('startDate').value;
            const endDate = document.getElementById('endDate').value;
            const remarks = document.getElementById('remarks').value;
            
            let dateText = '';
            if (startDate) {
                const d = new Date(startDate);
                const days = ['日', '月', '火', '水', '木', '金', '土'];
                dateText = `${d.getMonth() + 1}月${d.getDate()}日(${days[d.getDay()]})`;
                if (endDate && endDate !== startDate) {
                    const ed = new Date(endDate);
                    dateText += `〜${ed.getMonth() + 1}月${ed.getDate()}日(${days[ed.getDay()]})`;
                }
            }
            
            if (imgData) {
                container.innerHTML = `
                    <img src="${imgData}" alt="${currentTemplateNo}">
                    <div class="poster-overlay">
                        <div class="poster-notice-text">${noticeText}</div>
                        <div class="poster-date-text">${dateText}</div>
                        <div class="poster-remarks-text">${remarks}</div>
                    </div>
                `;
            } else {
                container.innerHTML = '<div class="poster-preview-placeholder">点検工事案内を選択</div>';
            }
        }

        function addEntry() {
            const propertyCode = document.getElementById('property').value;
            const terminalId = document.getElementById('terminal').value;
            const vendorIdx = document.getElementById('vendor').value;
            const inspectionIdx = document.getElementById('inspectionType').value;

            if (!propertyCode || vendorIdx === '' || inspectionIdx === '') {
                showToast('必須項目を入力してください', 'error');
                return;
            }

            const vendor = masterData.vendors[vendorIdx];
            const notice = masterData.notices[inspectionIdx];
            const property = masterData.properties.find(p => p.propertyCode === parseInt(propertyCode));
            const posterType = document.querySelector('input[name="posterType"]:checked').value;

            const entry = {
                terminalId: terminalId || property.terminalId,
                propertyCode: parseInt(propertyCode),
                propertyName: property.propertyName,
                vendorName: vendor.vendorName,
                emergencyContact: vendor.emergencyContact,
                inspectionType: notice.inspectionType,
                showOnBoard: document.getElementById('showOnBoard').checked,
                templateNo: notice.templateNo,
                startDate: document.getElementById('startDate').value,
                endDate: document.getElementById('endDate').value,
                remarks: document.getElementById('remarks').value,
                noticeText: document.getElementById('noticeText').value,
                frameNo: currentPosition,
                displayStartDate: document.getElementById('displayStartDate').value,
                displayEndDate: document.getElementById('displayEndDate').value,
                displayStartTime: document.getElementById('displayStartTime').value,
                displayEndTime: document.getElementById('displayEndTime').value,
                displayTime: parseInt(document.getElementById('displayTime').value) || 6,
                posterType: posterType
            };

            if (editingIndex >= 0) {
                entries[editingIndex] = entry;
                editingIndex = -1;
                showToast('更新しました', 'success');
            } else {
                entries.push(entry);
                showToast('追加しました', 'success');
            }
            renderDataList();
        }

        function renderDataList() {
            const container = document.getElementById('dataList');
            document.getElementById('dataCount').textContent = entries.length;
            document.getElementById('exportSection').style.display = entries.length > 0 ? 'flex' : 'none';

            if (entries.length === 0) {
                container.innerHTML = '<div class="empty-state">📭 データなし</div>';
                return;
            }

            container.innerHTML = entries.map((e, i) => `
                <div class="data-item">
                    <div class="data-item-info">
                        <div class="data-item-title">${e.inspectionType}</div>
                        <div class="data-item-sub">${e.propertyCode} | ${e.startDate || '-'}</div>
                    </div>
                    <span class="badge badge-success">${e.showOnBoard ? '表示' : '非表示'}</span>
                    <div class="data-item-actions">
                        <button class="btn btn-sm btn-outline" onclick="editEntry(${i})">編集</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteEntry(${i})">削除</button>
                    </div>
                </div>
            `).join('');
        }

        function editEntry(idx) {
            const e = entries[idx];
            editingIndex = idx;
            document.getElementById('property').value = e.propertyCode;
            onPropertyChange();
            document.getElementById('terminal').value = e.terminalId;
            const vendorIdx = masterData.vendors.findIndex(v => v.vendorName === e.vendorName);
            if (vendorIdx >= 0) { document.getElementById('vendor').value = vendorIdx; onVendorChange(); }
            const noticeIdx = masterData.notices.findIndex(n => n.inspectionType === e.inspectionType);
            if (noticeIdx >= 0) { document.getElementById('inspectionType').value = noticeIdx; currentTemplateNo = e.templateNo; }
            document.getElementById('showOnBoard').checked = e.showOnBoard;
            document.getElementById('startDate').value = e.startDate;
            document.getElementById('endDate').value = e.endDate;
            document.getElementById('remarks').value = e.remarks;
            document.getElementById('noticeText').value = e.noticeText;
            document.getElementById('displayStartDate').value = e.displayStartDate;
            document.getElementById('displayEndDate').value = e.displayEndDate;
            document.getElementById('displayStartTime').value = e.displayStartTime;
            document.getElementById('displayEndTime').value = e.displayEndTime;
            document.getElementById('displayTime').value = e.displayTime;
            setPosition(e.frameNo);
            document.querySelector(`input[name="posterType"][value="${e.posterType}"]`).checked = true;
            updatePreview();
        }

        function deleteEntry(idx) {
            if (confirm('削除しますか？')) {
                entries.splice(idx, 1);
                renderDataList();
                showToast('削除しました');
            }
        }

        function clearForm() {
            document.getElementById('property').value = '';
            document.getElementById('terminal').innerHTML = '<option value="">選択してください</option>';
            document.getElementById('vendor').value = '';
            document.getElementById('emergencyContact').value = '';
            document.getElementById('inspectionType').value = '';
            document.getElementById('showOnBoard').checked = true;
            document.getElementById('remarks').value = '';
            document.getElementById('noticeText').value = '';
            document.getElementById('displayStartTime').value = '';
            document.getElementById('displayEndTime').value = '';
            document.getElementById('displayTime').value = 6;
            document.getElementById('endDate').value = '';
            document.getElementById('displayEndDate').value = '';
            currentTemplateNo = '';
            editingIndex = -1;
            setPosition(2);
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('startDate').value = today;
            document.getElementById('displayStartDate').value = today;
            document.querySelector('input[name="posterType"][value="template"]').checked = true;
            updatePreview();
        }

        function generateCSV() {
            const headers = ['点検CO','端末ID','物件コード','受注先名','緊急連絡先番号','点検工事案内','掲示板に表示する','点検案内TPLNo','点検開始日','点検完了日','掲示備考','掲示板用案内文','frame_No','表示開始日','表示終了日','表示開始時刻','表示終了時刻','表示時間','統合ポリシー','制御','変更日','変更時刻','最終エクスポート日時','ID','変更日時','点検日時','表示日時','貼紙区分'];
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0].replace(/-/g, '/');
            const timeStr = now.toTimeString().substring(0, 8);

            const rows = entries.map(e => {
                const sd = e.startDate ? e.startDate.replace(/-/g, '/') : '';
                const ed = e.endDate ? e.endDate.replace(/-/g, '/') : sd;
                const dsd = e.displayStartDate ? e.displayStartDate.replace(/-/g, '/') : '';
                const ded = e.displayEndDate ? e.displayEndDate.replace(/-/g, '/') : ed;
                const dt = `0:00:${String(e.displayTime).padStart(2, '0')}`;
                return ['', e.terminalId, e.propertyCode, e.vendorName, e.emergencyContact, e.inspectionType, e.showOnBoard ? 'True' : 'False', e.templateNo, sd, ed, e.remarks.replace(/\n/g, '\r\n'), e.noticeText.replace(/\n/g, '\r\n'), e.frameNo, dsd, ded, e.displayStartTime || '', e.displayEndTime || '', dt, '', '', dateStr, '', '', '', `${dateStr} [${timeStr}]`, `${sd} [00:00:00]`, `${dsd} [00:00:00]`, e.posterType === 'template' ? 'テンプレート' : '追加'];
            });

            const esc = v => {
                if (v == null) return '';
                const s = String(v);
                return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s;
            };
            return [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
        }

        function downloadCSV() {
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

        function showToast(msg, type = '') {
            document.querySelectorAll('.toast').forEach(t => t.remove());
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.textContent = msg;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 2500);
        }

        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
        init();
