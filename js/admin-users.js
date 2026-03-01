// admin-users.js - ユーザー管理

import {
    getUser,
    getAllProfiles,
    updateProfileRole,
    updateUserProfile,
    updateUserStatus,
    createUser,
    getMasterVendors
} from './supabase-client.js';

import { escapeHtml, showToast } from './ui-utils.js';

/**
 * state: { profiles, masterData } へのアクセサと更新コールバック
 * init時に設定される
 */
let getState = null;
let setState = null;
let reloadAll = null;

/**
 * ユーザー管理モジュールを初期化
 * @param {Function} _getState - () => { profiles, masterData }
 * @param {Function} _setState - (key, value) => void
 * @param {Function} _reloadAll - loadAllData相当
 */
export function initUserModule(_getState, _setState, _reloadAll) {
    getState = _getState;
    setState = _setState;
    reloadAll = _reloadAll;
}

export async function loadUsers() {
    const tbody = document.getElementById('usersBody');
    tbody.innerHTML = '';

    const { profiles, masterData } = getState();

    // 現在のユーザーIDを取得
    const currentUser = await getUser();
    const currentUserId = currentUser?.id;

    profiles.forEach(profile => {
        const tr = document.createElement('tr');
        const createdAt = new Date(profile.created_at).toLocaleDateString('ja-JP');
        const roleClass = profile.role === 'admin' ? 'admin' : 'user';
        const roleText = profile.role === 'admin' ? '管理者' : 'ユーザー';
        const isSelf = profile.id === currentUserId;
        const status = profile.status || 'active';
        const statusClass = status === 'active' ? 'status-active' : 'status-inactive';
        const statusText = status === 'active' ? '有効' : '無効';

        // ベンダー名を取得
        let vendorName = '-';
        if (profile.vendor_id) {
            const vendor = masterData.vendors.find(v => String(v.id) === String(profile.vendor_id));
            vendorName = vendor ? vendor.vendor_name : 'Unknown (ID:' + profile.vendor_id + ')';
        }

        tr.innerHTML = `
            <td>${escapeHtml(profile.email)}${isSelf ? ' (自分)' : ''}</td>
            <td>${escapeHtml(vendorName)}</td>
            <td><span class="user-role ${roleClass}">${roleText}</span></td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>${createdAt}</td>
            <td>
                <button class="btn btn-sm btn-outline" onclick="openEditUserModal('${profile.id}')" ${isSelf ? 'disabled title="自分は編集できません"' : ''}>編集</button>
                ${!isSelf && status === 'active' ? `<button class="btn btn-sm btn-danger" onclick="handleDeactivateUser('${profile.id}')">無効化</button>` : ''}
                ${!isSelf && status === 'inactive' ? `<button class="btn btn-sm btn-success" onclick="handleActivateUser('${profile.id}')">有効化</button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });

    // 権限変更イベント
    document.querySelectorAll('.role-select').forEach(select => {
        select.addEventListener('change', async (e) => {
            const userId = e.target.dataset.userId;
            const newRole = e.target.value;
            const { profiles } = getState();

            // 自分自身の権限は変更不可（念のため二重チェック）
            if (userId === currentUserId) {
                showToast('自分の権限は変更できません', 'error');
                const profile = profiles.find(p => p.id === userId);
                if (profile) e.target.value = profile.role;
                return;
            }

            try {
                await updateProfileRole(userId, newRole);
                showToast('権限を更新しました', 'success');
                setState('profiles', await getAllProfiles());
                await loadUsers();
            } catch (_error) {
                showToast('権限の更新に失敗しました', 'error');
                const profile = profiles.find(p => p.id === userId);
                if (profile) e.target.value = profile.role;
            }
        });
    });
}

export async function openUserModal() {
    const modal = document.getElementById('userModal');
    const form = document.getElementById('userForm');
    const vendorSelect = document.getElementById('newUserVendor');
    const submitBtn = document.getElementById('userSubmitBtn');

    form.reset();

    // モーダルタイトルとボタンをリセット
    modal.querySelector('.modal-header h3').textContent = 'ユーザー追加';
    submitBtn.textContent = '追加';
    document.getElementById('newUserEmail').disabled = false;
    document.getElementById('newUserPassword').required = true;
    document.getElementById('newUserPassword').placeholder = '6文字以上';
    form.onsubmit = handleUserFormSubmit;

    // ベンダー選択肢を読み込み
    try {
        const vendors = await getMasterVendors();
        const options = ['<option value="">-- 選択してください --</option>'];
        vendors.forEach(v => {
            options.push(`<option value="${v.id}">${escapeHtml(v.vendor_name)}</option>`);
        });
        vendorSelect.innerHTML = options.join('');
    } catch (error) {
        console.error('Failed to load vendors:', error);
    }

    modal.classList.add('active');
}

export function closeUserModal() {
    const modal = document.getElementById('userModal');
    modal.classList.remove('active');
}

async function handleUserFormSubmit(e) {
    e.preventDefault();

    const email = document.getElementById('newUserEmail').value.trim();
    const password = document.getElementById('newUserPassword').value;
    const role = document.getElementById('newUserRole').value;
    const vendorId = document.getElementById('newUserVendor').value || null;
    const submitBtn = document.getElementById('userSubmitBtn');

    if (!vendorId) {
        showToast('保守会社を選択してください', 'error');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '追加中...';

    try {
        const user = await createUser(email, password, null, role, vendorId);

        if (user._needsEmailConfirmation) {
            showToast('ユーザーを追加しました（メール確認が必要です）', 'warning');
        } else {
            showToast('ユーザーを追加しました', 'success');
        }
        closeUserModal();

        // ユーザー一覧を更新
        setState('profiles', await getAllProfiles());
        await loadUsers();
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

export async function openEditUserModal(userId) {
    const { profiles } = getState();
    const profile = profiles.find(p => p.id === userId);
    if (!profile) return;

    const modal = document.getElementById('userModal');
    const form = document.getElementById('userForm');
    const vendorSelect = document.getElementById('newUserVendor');
    const submitBtn = document.getElementById('userSubmitBtn');

    // フォームに既存データを設定
    document.getElementById('newUserEmail').value = profile.email;
    document.getElementById('newUserEmail').disabled = true;
    document.getElementById('newUserPassword').value = '';
    document.getElementById('newUserPassword').required = false;
    document.getElementById('newUserPassword').placeholder = '変更する場合のみ入力';
    document.getElementById('newUserRole').value = profile.role;

    // ベンダー選択肢を読み込み
    try {
        const vendors = await getMasterVendors();
        const options = ['<option value="">-- 選択なし（管理者の場合） --</option>'];
        vendors.forEach(v => {
            const selected = v.id === profile.vendor_id ? 'selected' : '';
            options.push(`<option value="${v.id}" ${selected}>${escapeHtml(v.vendor_name)}</option>`);
        });
        vendorSelect.innerHTML = options.join('');
    } catch (error) {
        console.error('Failed to load vendors:', error);
    }

    // モーダルタイトルとボタンを変更
    modal.querySelector('.modal-header h3').textContent = 'ユーザー編集';
    submitBtn.textContent = '更新';

    // フォーム送信時の処理を編集用に変更
    form.onsubmit = async (e) => {
        e.preventDefault();
        await handleEditUserSubmit(userId);
    };

    modal.classList.add('active');
}

async function handleEditUserSubmit(userId) {
    const role = document.getElementById('newUserRole').value;
    const vendorId = document.getElementById('newUserVendor').value || null;
    const submitBtn = document.getElementById('userSubmitBtn');

    if (!vendorId) {
        showToast('保守会社を選択してください', 'error');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '更新中...';

    try {
        await updateUserProfile(userId, {
            role: role,
            vendor_id: vendorId
        });

        showToast('ユーザー情報を更新しました', 'success');
        closeUserModal();

        // フォームをリセット
        const form = document.getElementById('userForm');
        const modal = document.getElementById('userModal');
        form.onsubmit = handleUserFormSubmit;
        document.getElementById('newUserEmail').disabled = false;
        document.getElementById('newUserPassword').required = true;
        document.getElementById('newUserPassword').placeholder = '6文字以上';
        const modalTitle = modal?.querySelector('.modal-header h3');
        if (modalTitle) modalTitle.textContent = 'ユーザー追加';

        // データを再読み込み
        await reloadAll();
        await loadUsers();
    } catch (error) {
        console.error('User update error:', error);
        showToast('更新に失敗しました: ' + error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '更新';
    }
}

export async function handleDeactivateUser(userId) {
    if (!confirm('このユーザーを無効化してもよろしいですか？\nログインできなくなります。')) return;

    try {
        await updateUserStatus(userId, 'inactive');
        showToast('ユーザーを無効化しました', 'success');
        setState('profiles', await getAllProfiles());
        await loadUsers();
    } catch (error) {
        console.error('Failed to deactivate user:', error);
        showToast('無効化に失敗しました', 'error');
    }
}

export async function handleActivateUser(userId) {
    try {
        await updateUserStatus(userId, 'active');
        showToast('ユーザーを有効化しました', 'success');
        setState('profiles', await getAllProfiles());
        await loadUsers();
    } catch (error) {
        console.error('Failed to activate user:', error);
        showToast('有効化に失敗しました', 'error');
    }
}
