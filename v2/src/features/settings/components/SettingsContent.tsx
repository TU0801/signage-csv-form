import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useSettings } from '../hooks/useSettings';

export function SettingsContent() {
  const { addToast } = useToast();
  const { settings, loading, error, updateSetting } = useSettings();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const startEdit = (id: string, currentValue: string) => {
    setEditingId(id);
    setEditValue(currentValue);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const handleSave = async (id: string) => {
    try {
      await updateSetting(id, editValue);
      addToast('設定を保存しました', 'success');
      cancelEdit();
    } catch (err) {
      addToast(err instanceof Error ? err.message : '保存に失敗しました', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-red-600">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">設定</h1>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left">
            <th className="py-2 px-3 font-medium text-gray-700">キー</th>
            <th className="py-2 px-3 font-medium text-gray-700">値</th>
            <th className="py-2 px-3 font-medium text-gray-700">説明</th>
            <th className="py-2 px-3 font-medium text-gray-700">操作</th>
          </tr>
        </thead>
        <tbody>
          {settings.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-8 text-center text-gray-400">
                設定がありません
              </td>
            </tr>
          ) : (
            settings.map((setting) => (
              <tr key={setting.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 px-3 font-mono text-xs">{setting.setting_key}</td>
                <td className="py-2 px-3">
                  {editingId === setting.id ? (
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                    />
                  ) : (
                    <span className="text-gray-900">{setting.setting_value}</span>
                  )}
                </td>
                <td className="py-2 px-3 text-gray-500">{setting.description ?? '-'}</td>
                <td className="py-2 px-3">
                  {editingId === setting.id ? (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleSave(setting.id)}>
                        保存
                      </Button>
                      <Button variant="ghost" size="sm" onClick={cancelEdit}>
                        キャンセル
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEdit(setting.id, setting.setting_value)}
                    >
                      編集
                    </Button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
