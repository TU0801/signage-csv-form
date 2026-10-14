import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import type { DbAdSlot } from '@/types/database';
import type { AdSlotInput } from '../hooks/useAdSlots';

interface AdSlotModalProps {
  slot: DbAdSlot | null;
  onClose: () => void;
  onSave: (slot: DbAdSlot, input: AdSlotInput) => Promise<void>;
}

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

  const handleSave = async () => {
    if (!slot) return;
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
    <Modal open={!!slot} onClose={onClose} title={slot ? `広告枠 ${slot.slot_index} 編集` : '広告枠 編集'}>
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">現在の画像</p>
          <div className="flex min-h-24 items-center justify-center rounded-md bg-slate-50 p-2">
            {slot?.image_url ? (
              <img src={slot.image_url} alt="" className="max-h-40 max-w-full rounded" />
            ) : (
              <span className="text-sm text-gray-400">画像未設定</span>
            )}
          </div>
          <label htmlFor="adSlotImageFile" className="block text-sm font-medium text-gray-700">
            画像を変更（PNG/JPG、5MB以下）
          </label>
          <input
            id="adSlotImageFile"
            type="file"
            accept=".png,.jpg,.jpeg"
            onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />
        </div>
        <Input
          label="テキスト（キャプション）"
          id="adSlotCaption"
          maxLength={100}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="例: 〇〇のご案内"
        />
        <Input
          label="リンクURL"
          id="adSlotLinkUrl"
          type="url"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="https://example.com"
        />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          表示する
        </label>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
