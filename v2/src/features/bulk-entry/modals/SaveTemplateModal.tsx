import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useBulkStore } from '@/stores/bulkStore';
import { saveTemplate } from '../utils/bulkTemplates';

interface SaveTemplateModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * 今の行をテンプレートとして保存する（選択中の保守会社に紐付く。未選択なら全社共通）。
 * v1: bulk.html #templateModal / js/bulk-modals.js openSaveTemplateModal / saveTemplate
 */
export function SaveTemplateModal({ open, onClose, onSaved }: SaveTemplateModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="テンプレートを保存" className="max-w-md">
      {open && <SaveTemplateForm onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function SaveTemplateForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { addToast } = useToast();
  const [name, setName] = useState('');

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      addToast('テンプレート名を入力してください', 'error');
      return;
    }
    const { rows, currentVendor } = useBulkStore.getState();
    if (rows.length === 0) {
      addToast('保存するデータがありません', 'error');
      return;
    }
    saveTemplate(trimmed, rows, currentVendor);
    onClose();
    onSaved();
    addToast(`テンプレート「${trimmed}」を保存しました`, 'success');
  };

  return (
    <div className="space-y-4">
      <Input
        label="テンプレート名"
        id="templateName"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="例: A社定期清掃"
        autoFocus
      />
      {/* 保存先は localStorage なので、会社で共有されると誤解されないよう明記する */}
      <p className="text-xs text-gray-500">
        テンプレートはこのブラウザにだけ保存されます（別のPCや他の担当者からは見えません。ブラウザのデータを消すと消えます）。
      </p>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          キャンセル
        </Button>
        <Button onClick={handleSave}>保存</Button>
      </div>
    </div>
  );
}
