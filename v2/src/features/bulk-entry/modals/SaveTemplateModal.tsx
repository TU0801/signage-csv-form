import { useState, useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useBulkStore } from '@/stores/bulkStore';
import { useToast } from '@/components/ui/Toast';

const TEMPLATE_STORAGE_KEY = 'signage-cms-bulk-templates';

interface SavedTemplate {
  name: string;
  rows: unknown[];
  savedAt: string;
}

function loadTemplates(): SavedTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTemplates(templates: SavedTemplate[]) {
  try {
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // storage full
  }
}

interface SaveTemplateModalProps {
  open: boolean;
  onClose: () => void;
}

export function SaveTemplateModal({ open, onClose }: SaveTemplateModalProps) {
  const rows = useBulkStore((s) => s.rows);
  const importRows = useBulkStore((s) => s.importRows);
  const { addToast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [newName, setNewName] = useState('');
  const [mode, setMode] = useState<'save' | 'load'>('save');

  // Load templates from storage reactively on open or refresh
  const templates = useMemo(() => {
    if (!open) return [];
    // refreshKey is used to trigger re-read from localStorage
    void refreshKey;
    return loadTemplates();
  }, [open, refreshKey]);

  const handleSave = () => {
    if (!newName.trim()) return;
    if (rows.length === 0) {
      addToast('保存するデータがありません', 'warning');
      return;
    }

    const template: SavedTemplate = {
      name: newName.trim(),
      rows: rows.map((r) => {
        const data: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) {
          if (!k.startsWith('_')) data[k] = v;
        }
        return data;
      }),
      savedAt: new Date().toISOString(),
    };

    const updated = [...templates, template];
    saveTemplates(updated);
    setRefreshKey((k) => k + 1);
    setNewName('');
    addToast(`テンプレート「${template.name}」を保存しました`, 'success');
  };

  const handleLoad = (template: SavedTemplate) => {
    importRows(template.rows as Parameters<typeof importRows>[0]);
    addToast(`テンプレート「${template.name}」を読み込みました (${template.rows.length}件)`, 'success');
    onClose();
  };

  const handleDelete = (index: number) => {
    const updated = templates.filter((_t, i) => i !== index);
    saveTemplates(updated);
    setRefreshKey((k) => k + 1);
    addToast('テンプレートを削除しました', 'info');
  };

  return (
    <Modal open={open} onClose={onClose} title="テンプレート管理" className="max-w-lg">
      <div className="space-y-4">
        {/* Tab-like toggle */}
        <div className="flex border-b border-gray-200">
          <button
            className={`px-4 py-2 text-sm font-medium ${mode === 'save' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setMode('save')}
          >
            保存
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium ${mode === 'load' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setMode('load')}
          >
            読み込み ({templates.length})
          </button>
        </div>

        {mode === 'save' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              現在の{rows.length}件のデータをテンプレートとして保存します。
            </p>
            <div className="flex gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="テンプレート名"
                className="flex-1"
              />
              <Button onClick={handleSave} disabled={!newName.trim() || rows.length === 0}>
                保存
              </Button>
            </div>
          </div>
        )}

        {mode === 'load' && (
          <div className="space-y-2">
            {templates.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">
                保存されたテンプレートはありません
              </p>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-2">
                {templates.map((template, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-md border border-gray-200 p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{template.name}</p>
                      <p className="text-xs text-gray-500">
                        {template.rows.length}件 - {new Date(template.savedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => handleLoad(template)}>
                        読込
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(i)}
                      >
                        削除
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>
            閉じる
          </Button>
        </div>
      </div>
    </Modal>
  );
}
