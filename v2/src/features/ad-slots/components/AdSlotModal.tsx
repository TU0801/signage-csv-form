import { useState, useEffect, useRef } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import type { DbAdSlot } from '@/types/database';
import { adImageFileError, adLinkUrlBlocked, adLinkUrlError, type AdSlotInput } from '../hooks/useAdSlots';

interface AdSlotModalProps {
  slot: DbAdSlot | null;
  onClose: () => void;
  onSave: (slot: DbAdSlot, input: AdSlotInput) => Promise<void>;
}

/** 画像の見本の枠。ログイン画面と同じく切らずに全体を出す（object-contain） */
const PREVIEW_BOX = 'flex aspect-[2/1] items-center justify-center overflow-hidden rounded-md bg-slate-50';

/** 画像は保存を押したときにアップロードする（選んだだけでは Storage を変えない） */
// v1: js/admin-masters-ads.js openAdSlotModal / saveAdSlot（admin.html #adSlotModal）
export function AdSlotModal({ slot, onClose, onSave }: AdSlotModalProps) {
  const { addToast } = useToast();
  const [caption, setCaption] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (slot) {
      setCaption(slot.caption || '');
      setLinkUrl(slot.link_url || '');
      setIsActive(slot.is_active || false);
      setImageFile(null);
    }
  }, [slot]);

  // 選んだ時点で拡張子・サイズを確かめる（保存時にも useAdSlots で同じ確認をする）
  const fileError = imageFile ? adImageFileError(imageFile) : null;

  // 選んだ画像を保存前に見せる。URL はファイルを選んだときに作り、差し替え・閉じるときに解放する
  // （useMemo で作ると StrictMode の effect の付け直しで解放済みの URL を指したままになる）
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const changeImageFile = (file: File | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = file && !adImageFileError(file) ? URL.createObjectURL(file) : null;
    previewUrlRef.current = url;
    setPreviewUrl(url);
    setImageFile(file);
  };
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    };
  }, []);

  const dirty =
    !!slot &&
    (imageFile !== null ||
      caption !== (slot.caption || '') ||
      linkUrl !== (slot.link_url || '') ||
      isActive !== (slot.is_active || false));

  // リンクの書式は警告だけ（保存は止めない。v1 と同じく入力どおり保存する）。保存済みのリンクを触っていなければ出さない
  const linkWarning = !slot || linkUrl.trim() === (slot.link_url || '').trim() ? null : adLinkUrlError(linkUrl);

  const linkBlocked = adLinkUrlBlocked(linkUrl);

  const handleSave = async () => {
    if (!slot) return;
    if (fileError || linkBlocked) return;
    setSaving(true);
    try {
      await onSave(slot, { imageFile, caption, linkUrl, isActive });
      addToast('広告枠を保存しました', 'success');
      onClose();
    } catch (err) {
      console.error('広告枠保存エラー:', err);
      addToast(`保存に失敗しました: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!slot}
      onClose={onClose}
      title={slot ? `広告枠 ${slot.slot_index} 編集` : '広告枠 編集'}
      dirty={dirty}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !!fileError || linkBlocked}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <div className={previewUrl ? 'grid grid-cols-2 gap-2' : undefined}>
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-700">現在の画像</p>
              <div className={PREVIEW_BOX}>
                {slot?.image_url ? (
                  <img src={slot.image_url} alt="" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-sm text-gray-400">画像未設定</span>
                )}
              </div>
            </div>
            {previewUrl && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-blue-700">変更後</p>
                <div className={PREVIEW_BOX}>
                  <img src={previewUrl} alt="" className="h-full w-full object-contain" />
                </div>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500">
            {previewUrl && '変更後の画像は保存すると差し替わります。'}
            ログイン画面と同じく、画像は切らずに全体を表示します
          </p>
          <label htmlFor="adSlotImageFile" className="block text-sm font-medium text-gray-700">
            画像を変更（PNG/JPG、5MB以下）
          </label>
          <input
            id="adSlotImageFile"
            type="file"
            accept=".png,.jpg,.jpeg"
            onChange={(e) => changeImageFile(e.target.files?.[0] ?? null)}
            aria-invalid={fileError ? true : undefined}
            className="block w-full text-sm"
          />
          {fileError && <p className="text-xs text-red-600">{fileError}</p>}
        </div>
        <div className="space-y-1">
          <Input
            label="テキスト（キャプション）"
            id="adSlotCaption"
            maxLength={100}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="例: 〇〇のご案内"
          />
          {/* v1 と同じくログイン画面は画像とリンクだけを使う */}
          <p className="text-xs text-gray-500">管理画面での見分け用です（ログイン画面には表示されません）</p>
        </div>
        <div className="space-y-1">
          <Input
            label="リンクURL"
            id="adSlotLinkUrl"
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://example.com"
          />
          {linkBlocked ? (
            <p className="text-xs text-red-600">このリンクは安全のため保存できません。https:// から始まるURLを入力してください</p>
          ) : (
            linkWarning && <p className="text-xs text-amber-700">{linkWarning}（このままでも保存できます）</p>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          表示する
        </label>
      </div>
    </Modal>
  );
}
