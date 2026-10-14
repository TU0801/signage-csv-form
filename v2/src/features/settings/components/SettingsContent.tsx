import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useSettings } from '../hooks/useSettings';
import { SETTING_FIELDS, type SettingKey, type SettingValues } from '../settingFields';

// v1: js/admin-settings.js loadAppSettings / saveSettings（admin.html #master-settings）
export function SettingsContent() {
  const { addToast } = useToast();
  const { values, loading, error, saveSettings } = useSettings();
  const [form, setForm] = useState<SettingValues>(values);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(values);
  }, [values]);

  const handleChange = (key: SettingKey, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
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
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">設定</h2>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="max-w-md space-y-4">
        {SETTING_FIELDS.map((f) => (
          <div key={f.key} className="space-y-1">
            <Input
              label={f.label}
              id={`setting-${f.key}`}
              type="number"
              min={f.min}
              max={f.max}
              value={form[f.key]}
              onChange={(e) => handleChange(f.key, e.target.value)}
            />
            {'hint' in f && <p className="text-xs text-gray-500">{f.hint}</p>}
          </div>
        ))}
        <div className="pt-2">
          <Button type="button" onClick={handleSave} disabled={saving}>
            設定を保存
          </Button>
        </div>
      </div>
    </div>
  );
}
