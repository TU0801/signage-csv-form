import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { unitManagedTypeIds } from '@/lib/api/inspections';
import { useAuthStore } from '@/stores/authStore';
import type { DbInspectionType, DbVendor, Terminal } from '@/types/database';
import type { PropertyInspection, PropertyUnit, UnitInspectionTypeOption } from '@/types/app';
import type { PropertyWithUnits } from '../../hooks/usePropertyMasterData';
import {
  cloneUnits,
  collectTerminals,
  savePropertyForm,
  validateUnitInspections,
} from '../../lib/propertyForm';
import { TerminalEditor } from './TerminalEditor';
import { PropertyInspectionEditor } from './PropertyInspectionEditor';
import { UnitInspectionEditor } from './UnitInspectionEditor';

const BIZ_PROPERTIES_URL = 'https://system.1984.jp/properties';

interface PropertyFormModalProps {
  /** 編集する物件。null なら追加 */
  property: PropertyWithUnits | null;
  vendors: DbVendor[];
  inspectionTypes: DbInspectionType[];
  unitTypeOptions: UnitInspectionTypeOption[];
  onClose: () => void;
  /** 保存した（物件の保存が成功した）あと。一覧を読み直す */
  onSaved: () => void;
}

/**
 * 物件の追加・編集モーダル。開くたびに作り直す（呼ぶ側が開いているときだけ描画し、key を物件ごとに変える）ので、
 * 編集中の状態（設備情報の編集位置など）が別の物件に持ち越されない。
 */
// v1: js/admin-masters.js openMasterModal('property') / handleMasterFormSubmit / admin.html #propertyFields（v1.29.1 のレイアウト）
export function PropertyFormModal({
  property,
  vendors,
  inspectionTypes,
  unitTypeOptions,
  onClose,
  onSaved,
}: PropertyFormModalProps) {
  const { addToast } = useToast();
  const profile = useAuthStore((s) => s.profile);

  const [code, setCode] = useState(property?.property_code ?? '');
  const [name, setName] = useState(property?.property_name ?? '');
  // 端末が無ければ空の1行を出す（空のまま保存すれば端末なし）
  const [terminals, setTerminals] = useState<Terminal[]>(() =>
    property?.terminals.length ? property.terminals.map((t) => ({ ...t })) : [{ terminal_id: '', supplement: '' }],
  );
  // 台ごとの保守。開いたときの状態を差分の基準に取っておく
  const [originalUnits] = useState<PropertyUnit[]>(() => cloneUnits(property?.units));
  const [units, setUnits] = useState<PropertyUnit[]>(() => cloneUnits(property?.units));
  // その物件で台ごとに管理している点検種別。設備情報の表・選択肢・保存の対象から外す
  const [managedTypeIds] = useState<Set<string>>(() =>
    unitManagedTypeIds(property?.units ?? [], unitTypeOptions),
  );
  // 設備情報。一覧には台の保守の集計が1行で返ってくるが、ここから直すと業務システムが断るので外す
  const [inspections, setInspections] = useState<PropertyInspection[]>(() =>
    (property?.inspections ?? [])
      .filter((e) => !managedTypeIds.has(e.inspection_type_id))
      .map((e) => ({ ...e })),
  );
  const [saving, setSaving] = useState(false);

  const showError = (message: string) => addToast(message, 'error');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // 物件コードは英数字（z0023A01 等）もあるので文字列のまま扱う（DB も text 型。v1.32.0）
    const propertyCode = code.trim();
    if (!propertyCode) {
      showError('物件コードを入力してください');
      return;
    }
    // 台ごとの保守の確認は物件の保存より前（後だと物件だけ保存されて台の保守が残る）
    const unitError = validateUnitInspections(units);
    if (unitError) {
      showError(unitError);
      return;
    }

    setSaving(true);
    try {
      const result = await savePropertyForm({
        id: property?.id ?? null,
        propertyCode,
        propertyName: name,
        terminals: collectTerminals(terminals),
        inspections,
        managedTypeIds,
        originalUnits,
        units,
        profile,
      });
      addToast(property ? '物件を更新しました' : '物件を追加しました', 'success');
      if (result.added > 0) {
        addToast(`保守会社 ${result.added} 件を紐付け管理にも追加しました`, 'success');
      }
      // 業務システムが断った理由はそのまま出す（定型文だと何を直せばよいか分からない）
      if (result.errors.length > 0) showError(result.errors.join(' ／ '));
      onClose();
      onSaved();
    } catch (err) {
      console.error('Failed to save property:', err);
      showError('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={property ? '物件を編集' : '物件を追加'}
      className="max-w-6xl"
      // 保存・キャンセルは本文のスクロールの外に置く。フォームの外になるので form 属性で送信先を結ぶ
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            キャンセル
          </Button>
          <Button type="submit" form="property-form" disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </>
      }
    >
      <form id="property-form" onSubmit={handleSubmit} className="space-y-3">
        {/* FHD（2xl）では物件コード・物件名・端末リストを1行に並べる */}
        <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2 2xl:grid-cols-3">
          <Input
            label="物件コード *"
            id="property-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Input
            label="物件名 *"
            id="property-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="sm:col-span-2 2xl:col-span-1">
            <TerminalEditor value={terminals} onChange={setTerminals} />
          </div>
        </div>

        <section className="space-y-2 border-t border-gray-200 pt-3">
          <h3 className="text-sm font-semibold text-gray-900">設備情報</h3>
          <PropertyInspectionEditor
            value={inspections}
            onChange={setInspections}
            inspectionTypes={inspectionTypes}
            excludedTypeIds={managedTypeIds}
            vendors={vendors}
            onError={showError}
          />
        </section>

        {/* 台がある物件のときだけ出す */}
        {units.length > 0 && (
          <section className="space-y-2 border-t border-gray-200 pt-3">
            <h3 className="text-sm font-semibold text-gray-900">台ごとの保守</h3>
            <p className="text-sm text-gray-500">
              台を登録した設備の保守は、台ごとに編集します（上の設備情報の表には出ません）。台の追加・削除、保守会社固有コード・設置場所・金額の変更は業務システムで行います（
              <a
                href={BIZ_PROPERTIES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
              >
                業務システムを開く
              </a>
              ）
            </p>
            <UnitInspectionEditor
              units={units}
              onChange={setUnits}
              typeOptions={unitTypeOptions}
              vendors={vendors}
              onError={showError}
            />
          </section>
        )}
      </form>
    </Modal>
  );
}
