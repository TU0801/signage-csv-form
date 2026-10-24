import { useState, useEffect, useRef } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import type { DbAdSlot } from '@/types/database';
import { safePosterUrl } from '@/lib/posterUrl';
import { adImageExtensionError, adImageFileError, adLinkUrlError, type AdSlotInput } from '../hooks/useAdSlots';
import { sourceTypeFromUrl } from '../lib/adImage';
import { AdImageCropper } from './AdImageCropper';

interface AdSlotModalProps {
  slot: DbAdSlot | null;
  onClose: () => void;
  onSave: (slot: DbAdSlot, input: AdSlotInput) => Promise<void>;
  /** 枠の中身（画像・テキスト・リンク）を消して非表示にする（行は残す） */
  onClear: (slot: DbAdSlot) => Promise<void>;
}

/** 切り抜き画面に出している画像（選んだファイルの blob: URL か、保存済みの画像の公開 URL） */
interface CropSource {
  src: string;
  type: string;
}

/** 画像の見本の枠。ログイン画面と同じく切らずに全体を出す（object-contain） */
const PREVIEW_BOX = 'flex aspect-[2/1] items-center justify-center overflow-hidden rounded-md bg-slate-50';

/**
 * 画像は選ぶと切り抜き画面（横:縦 = 2:1）を出し、切り抜いた 1920×960 の画像を保存を押したときにアップロードする
 * （選んだだけでは Storage を変えない）。保存済みの画像も切り抜き直せる。
 */
// v1: js/admin-masters-ads.js openAdSlotModal / saveAdSlot（admin.html #adSlotModal）
export function AdSlotModal({ slot, onClose, onSave, onClear }: AdSlotModalProps) {
  const { addToast } = useToast();
  const [caption, setCaption] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [cropSource, setCropSource] = useState<CropSource | null>(null);
  // 選んだ元画像（切り抜き範囲を変え直すために、閉じるか選び直すまで残す）
  const [picked, setPicked] = useState<CropSource | null>(null);
  const pickedUrlRef = useRef<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  useEffect(() => {
    if (slot) {
      setCaption(slot.caption || '');
      setLinkUrl(slot.link_url || '');
      setIsActive(slot.is_active || false);
      setImageFile(null);
    }
  }, [slot]);

  // 切り抜いた画像の拡張子・サイズ（5MB）を確かめる（保存時にも useAdSlots で同じ確認をする）
  const fileError = imageFile ? adImageFileError(imageFile) : null;

  // 切り抜いた画像を保存前に見せる。URL は画像が決まったときに作り、差し替え・閉じるときに解放する
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
      if (pickedUrlRef.current) URL.revokeObjectURL(pickedUrlRef.current);
      pickedUrlRef.current = null;
    };
  }, []);

  // 画像を選んだら切り抜き画面を出す（PNG/JPG 以外はここで断る）
  const pickFile = (file: File | null) => {
    if (!file) return;
    const err = adImageExtensionError(file);
    setPickError(err);
    if (err) return;
    if (pickedUrlRef.current) URL.revokeObjectURL(pickedUrlRef.current);
    const url = URL.createObjectURL(file);
    pickedUrlRef.current = url;
    const type = file.type || (file.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
    const source = { src: url, type };
    setPicked(source);
    setCropSource(source);
  };

  // 広告画像は poster-images/ads/ に置く。それ以外の URL は表示にも切り抜き直しにも使わない
  const currentImageUrl = safePosterUrl(slot?.image_url);
  const recropCurrent = () => {
    if (!currentImageUrl) return;
    setPickError(null);
    setCropSource({ src: currentImageUrl, type: sourceTypeFromUrl(currentImageUrl) });
  };

  const dirty =
    !!slot &&
    (imageFile !== null ||
      cropSource !== null ||
      caption !== (slot.caption || '') ||
      linkUrl !== (slot.link_url || '') ||
      isActive !== (slot.is_active || false));

  const hasContent = !!slot && (!!slot.image_url || !!slot.caption || !!slot.link_url || !!slot.is_active);

  // http(s):// で始まらないリンクは保存できない（保存済みの値がそうでも、直すまで保存を止める）
  const linkError = adLinkUrlError(linkUrl);
  const linkBlocked = !!linkError;

  const handleSave = async () => {
    if (!slot) return;
    if (fileError || linkBlocked || cropSource) return;
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

  const handleClear = async () => {
    if (!slot) return;
    setSaving(true);
    try {
      await onClear(slot);
      addToast('広告枠のコンテンツを削除しました', 'success');
      onClose();
    } catch (err) {
      console.error('広告枠削除エラー:', err);
      addToast(`削除に失敗しました: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal
        open={!!slot}
        onClose={onClose}
        title={slot ? `広告枠 ${slot.slot_index} 編集` : '広告枠 編集'}
        dirty={dirty}
        footer={
          <>
            {hasContent && (
              <Button
                type="button"
                variant="danger"
                className="mr-auto"
                onClick={() => setConfirmingClear(true)}
                disabled={saving}
              >
                コンテンツを削除
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={onClose}>
              キャンセル
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || !!fileError || linkBlocked || !!cropSource}
            >
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
                  {currentImageUrl ? (
                    <img src={currentImageUrl} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-sm text-gray-400">画像未設定</span>
                  )}
                </div>
              </div>
              {previewUrl && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-blue-700">変更後</p>
                  <div className={PREVIEW_BOX}>
                    <img src={previewUrl} alt="変更後の画像" className="h-full w-full object-contain" />
                  </div>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500">
              {previewUrl && '変更後の画像は保存すると差し替わります。'}
              画像は横:縦 = 2:1（1920×960）に切り抜いて保存します。見本はログイン画面と同じく、画像を切らずに全体を表示します
            </p>
            {cropSource ? (
              <AdImageCropper
                key={cropSource.src}
                src={cropSource.src}
                sourceType={cropSource.type}
                slotIndex={slot?.slot_index ?? 0}
                onCancel={() => setCropSource(null)}
                onCropped={(file) => {
                  changeImageFile(file);
                  setCropSource(null);
                }}
              />
            ) : (
              <div className="space-y-1">
                <label htmlFor="adSlotImageFile" className="block text-sm font-medium text-gray-700">
                  画像を選ぶ（PNG/JPG。選ぶと切り抜き画面が出ます）
                </label>
                <input
                  id="adSlotImageFile"
                  type="file"
                  accept=".png,.jpg,.jpeg"
                  onChange={(e) => {
                    pickFile(e.target.files?.[0] ?? null);
                    // 同じファイルを選び直しても切り抜き画面を出す
                    e.target.value = '';
                  }}
                  aria-invalid={pickError || fileError ? true : undefined}
                  className="block w-full text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  {currentImageUrl && (
                    <Button type="button" variant="secondary" size="sm" onClick={recropCurrent}>
                      現在の画像を切り抜き直す
                    </Button>
                  )}
                  {picked && imageFile && (
                    <Button type="button" variant="secondary" size="sm" onClick={() => setCropSource(picked)}>
                      選んだ画像の切り抜き範囲を変える
                    </Button>
                  )}
                </div>
              </div>
            )}
            {pickError && <p className="text-xs text-red-600">{pickError}</p>}
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
            {linkError && <p className="text-xs text-red-600">{linkError}</p>}
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
      <ConfirmDialog
        open={confirmingClear}
        onClose={() => setConfirmingClear(false)}
        onConfirm={() => void handleClear()}
        title="コンテンツの削除"
        message={`広告枠 ${slot?.slot_index ?? ''} の画像・テキスト・リンクURLを消して非表示にします。\n画像ファイルも削除するため元に戻せません。`}
        confirmLabel="削除する"
        variant="danger"
      />
    </>
  );
}
