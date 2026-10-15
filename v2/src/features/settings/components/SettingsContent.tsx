import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useSettings } from '../hooks/useSettings';
import { SETTING_FIELDS, validateSettings, type SettingKey, type SettingValues } from '../settingFields';

// v1: js/admin-settings.js loadAppSettings / saveSettings（admin.html #master-settings）
export function SettingsContent() {
  const { addToast } = useToast();
  const { values, loading, error, saveSettings } = useSettings();
  const [form, setForm] = useState<SettingValues>(values);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<SettingKey, string>>>({});

  useEffect(() => {
    setForm(values);
  }, [values]);

  const handleChange = (key: SettingKey, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    const nextErrors = validateSettings(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      addToast('入力に誤りがあります。赤字の項目を直してください', 'error');
      return;
    }
    setSaving(true);
    try {
      await saveSettings(form);
      addToast('設定を保存しました', 'success');
    } catch (err) {
      console.error('Failed to save settings:', err);
      addToast('設定の保存に失敗しました', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    // 見出しはタブ名（設定）と重なるので置かない
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="max-w-5xl space-y-3">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
          {SETTING_FIELDS.map((f) => (
            <div key={f.key} className="space-y-0.5">
              <Input
                label={f.label}
                id={`setting-${f.key}`}
                type="number"
                min={f.min}
                max={f.max}
                value={form[f.key]}
                error={errors[f.key]}
                onChange={(e) => handleChange(f.key, e.target.value)}
              />
              <p className="text-xs text-gray-500">
                {'hint' in f ? `${f.hint}（${f.min}〜${f.max}）` : `${f.min}〜${f.max} の範囲`}
              </p>
            </div>
          ))}
        </div>
        <div>
          <Button type="button" onClick={handleSave} disabled={saving}>
            設定を保存
          </Button>
        </div>
      </div>
    </div>
  );
}
