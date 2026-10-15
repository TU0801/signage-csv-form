import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { deleteTemplate, getStoredTemplates, type BulkTemplate } from '../utils/bulkTemplates';

interface ManageTemplateModalProps {
  open: boolean;
  onClose: () => void;
  /** 選択中の保守会社のテンプレートと全社共通 */
  templates: BulkTemplate[];
  onChanged: () => void;
  confirm: (message: string) => Promise<boolean>;
}

/**
 * 登録済みテンプレートの一覧と削除。
 * v1: bulk.html #manageTemplateModal / js/bulk-modals.js renderManageTemplateList / deleteTemplate
 */
export function ManageTemplateModal({ open, onClose, templates, onChanged, confirm }: ManageTemplateModalProps) {
  const { addToast } = useToast();

  const handleDelete = async (id: string) => {
    const target = getStoredTemplates().find((t) => t.id === id);
    if (!target) return;
    if (!(await confirm(`テンプレート「${target.name}」を削除しますか？\nこの操作は取り消せません。`))) return;
    deleteTemplate(id);
    onChanged();
    addToast(`テンプレート「${target.name}」を削除しました`, 'success');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="テンプレート管理"
      className="max-w-xl"
      footer={
        <Button variant="secondary" onClick={onClose}>
          閉じる
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-gray-500">選択中の保守会社のテンプレートと全社共通テンプレートを表示しています。</p>
        {templates.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500">登録済みのテンプレートはありません</p>
        ) : (
          <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900" title={t.name}>
                    {t.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t.vendorName ? t.vendorName : '全社共通'} ・ {Array.isArray(t.rows) ? t.rows.length : 0}行
                  </p>
                </div>
                <Button size="sm" variant="secondary" className="text-red-600" onClick={() => handleDelete(t.id)}>
                  削除
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
