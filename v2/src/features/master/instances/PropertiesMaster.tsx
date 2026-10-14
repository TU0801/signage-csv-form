import { useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TABLES } from '@/lib/supabase';
import { toTerminal } from '@/lib/terminal';
import type { DbProperty, DbTerminal, Terminal } from '@/types/database';
import type { MasterConfig, FormFieldDef } from '../types/masterConfig';
import type { useForm } from 'react-hook-form';
import { MasterListPage } from '../components/MasterListPage';

type PropertyRecord = DbProperty & Record<string, unknown>;

const config: MasterConfig<PropertyRecord> = {
  tableName: TABLES.properties,
  displayName: '物件',
  searchField: 'property_name',
  uniqueField: 'property_code',
  defaultSort: 'property_code',
  columns: [
    { key: 'property_code', label: '物件コード', width: '140px' },
    { key: 'property_name', label: '物件名' },
    { key: 'terminals', label: '端末数', width: '100px' },
  ],
  formFields: [
    { name: 'property_code', label: '物件コード', type: 'text', required: true },
    { name: 'property_name', label: '物件名', type: 'text', required: true },
    { name: 'terminals', label: '端末一覧', type: 'custom' },
  ],
  defaultValues: {
    property_code: '',
    property_name: '',
    terminals: [],
  } as Partial<PropertyRecord>,
  // v1 js/supabase/admin-masters.js addProperty / updateProperty と同じ3列だけ送る。
  // equipment は block_equipment_write トリガーが変更を拒否するので送らない（id・created_at も送らない）。
  // 端末IDが空の行は保存しない（v1 handleMasterFormSubmit。空の端末が選択肢に出るのを防ぐ）
  toPayload: (data) =>
    ({
      property_code: String(data.property_code ?? '').trim(),
      property_name: data.property_name,
      terminals: ((data.terminals as DbTerminal[] | undefined) ?? [])
        .map(toTerminal)
        .map((t) => ({ terminal_id: t.terminal_id.trim(), supplement: t.supplement.trim() }))
        .filter((t) => t.terminal_id),
    }) as Partial<PropertyRecord>,
};

// 既存データは terminalId / terminal_id が混在する。読むときに正規化し、書くときは v1 と同じ terminal_id にそろえる
// （v1: js/admin-masters.js handleMasterFormSubmit。{id} 形式で書くと v1 の画面から端末が見えなくなる）
function TerminalEditor({
  value: rawValue,
  onChange,
}: {
  value: DbTerminal[];
  onChange: (terminals: Terminal[]) => void;
}) {
  const value = rawValue.map(toTerminal);

  const addTerminal = () => {
    onChange([...value, { terminal_id: `T${value.length + 1}`, supplement: '' }]);
  };

  const removeTerminal = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const updateTerminal = (index: number, field: keyof Terminal, val: string) => {
    const updated = value.map((t, i) => (i === index ? { ...t, [field]: val } : t));
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">端末一覧</label>
      {value.map((terminal, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            placeholder="端末ID"
            value={terminal.terminal_id}
            onChange={(e) => updateTerminal(index, 'terminal_id', e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="補足"
            value={terminal.supplement}
            onChange={(e) => updateTerminal(index, 'supplement', e.target.value)}
            className="flex-1"
          />
          <Button variant="danger" size="sm" type="button" onClick={() => removeTerminal(index)}>
            削除
          </Button>
        </div>
      ))}
      <Button variant="secondary" size="sm" type="button" onClick={addTerminal}>
        端末を追加
      </Button>
    </div>
  );
}

export function PropertiesMaster() {
  const renderCell = useCallback((key: string, value: unknown) => {
    if (key === 'terminals' && Array.isArray(value)) {
      return `${value.length}件`;
    }
    return undefined;
  }, []);

  const renderCustomField = useCallback(
    (field: FormFieldDef, form: ReturnType<typeof useForm>) => {
      if (field.name === 'terminals') {
        const terminals = (form.watch('terminals') as DbTerminal[]) ?? [];
        return (
          <TerminalEditor
            value={terminals}
            onChange={(val) => form.setValue('terminals', val, { shouldDirty: true })}
          />
        );
      }
      return null;
    },
    [],
  );

  return (
    <MasterListPage
      config={config}
      renderCell={renderCell}
      renderCustomField={renderCustomField}
    />
  );
}
