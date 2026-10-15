import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TextArea } from '@/components/ui/TextArea';
import type { DbCategory, DbInspectionType, DbTemplateImage } from '@/types/database';
import type { InspectionTypeInput } from '@/lib/api/admin-masters';
import { buildTemplateOptions, resolveTemplateKey } from '../lib/inspectionTypes';
import { resolveTemplateImageUrl } from '@/features/single-entry/lib/templateImages';
import { templateFileUrl } from '@/lib/templateStorage';

const BIZ_TEMPLATE_SETTINGS_URL = 'https://system.1984.jp/settings?tab=template-images';

interface InspectionTypeFormModalProps {
  /** 編集する点検種別。null なら追加 */
  item: DbInspectionType | null;
  categories: DbCategory[];
  templateImages: DbTemplateImage[];
  onClose: () => void;
  /** 失敗したら throw する（モーダルは開いたまま） */
  onSubmit: (input: InspectionTypeInput) => Promise<void>;
}

/** 開くたびに作り直す（呼ぶ側が open のときだけ描画する）ので、初期値は useState の初期化で入れる */
// v1: js/admin-masters.js openMasterModal('inspection') / admin.html #inspectionFields
export function InspectionTypeFormModal({
  item,
  categories,
  templateImages,
  onClose,
  onSubmit,
}: InspectionTypeFormModalProps) {
  const groups = useMemo(() => buildTemplateOptions(templateImages), [templateImages]);
  const allKeys = useMemo(() => groups.flatMap((g) => g.options.map((o) => o.value)), [groups]);

  const [name, setName] = useState(item?.inspection_name ?? '');
  const [category, setCategory] = useState(item?.category ?? '');
  const [templateNo, setTemplateNo] = useState(() =>
    resolveTemplateKey(item?.template_no ?? '', allKeys),
  );
  const [noticeText, setNoticeText] = useState(item?.default_text ?? '');
  const [showOnBoard, setShowOnBoard] = useState(item ? item.show_on_board !== false : true);
  // 開いたときの値。閉じる（Esc・背景・×）前の破棄確認に使う（テンプレートは選択肢のキーにそろえた後の値と比べる）
  const [initial] = useState(() => ({ name, category, templateNo, noticeText, showOnBoard }));
  const dirty =
    name !== initial.name ||
    category !== initial.category ||
    templateNo !== initial.templateNo ||
    noticeText !== initial.noticeText ||
    showOnBoard !== initial.showOnBoard;
  const [saving, setSaving] = useState(false);
  const [imageError, setImageError] = useState(false);

  const selected = groups.flatMap((g) => g.options).find((o) => o.value === templateNo);
  // 選択肢の画像 → DB の image_key → 固定表（末尾一致を含む）の順。v1 は固定表を images/ から読む
  const previewUrl = templateNo
    ? selected?.imageUrl || resolveTemplateImageUrl(templateNo, templateImages, templateFileUrl)
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit({
        inspection_name: name,
        category,
        template_no: templateNo,
        default_text: noticeText,
        show_on_board: showOnBoard,
      });
      onClose();
    } catch {
      // 文言は onSubmit 側で出す
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      dirty={dirty}
      title={item ? '点検種別を編集' : '点検種別を追加'}
      className="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="点検種別名 *"
          id="inspection-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="space-y-0.5">
          <label htmlFor="inspection-category" className="block text-xs font-medium text-gray-600">
            カテゴリ
          </label>
          <select
            id="inspection-category"
            className="block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">カテゴリを選択</option>
            {categories.map((c) => (
              <option key={c.id} value={c.category_name}>
                {c.category_name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-0.5">
          <label htmlFor="inspection-template" className="block text-xs font-medium text-gray-600">
            テンプレート画像
          </label>
          <select
            id="inspection-template"
            className="block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            value={templateNo}
            onChange={(e) => {
              setTemplateNo(e.target.value);
              setImageError(false);
            }}
          >
            <option value="">画像なし</option>
            {/* 保存済みの値が選択肢に無いときも値を保つ（v1 は select に無い値だと空になる） */}
            {templateNo && !allKeys.includes(templateNo) && <option value={templateNo}>{templateNo}</option>}
            {groups.map((g) =>
              g.label ? (
                <optgroup key={g.label} label={g.label}>
                  {g.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ) : (
                g.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))
              ),
            )}
          </select>
          {/* v1: js/admin-masters.js updateTemplatePreviewWithMasterData */}
          <div className="mt-2 flex min-h-20 items-center justify-center rounded-lg bg-slate-50 p-2 text-sm">
            {!templateNo ? (
              <span className="text-slate-400">プレビュー</span>
            ) : previewUrl && !imageError ? (
              <img
                src={previewUrl}
                alt={selected?.label ?? templateNo}
                className="max-h-[120px] max-w-full rounded"
                onError={() => setImageError(true)}
              />
            ) : previewUrl ? (
              <span className="text-red-500">画像が見つかりません</span>
            ) : (
              <span className="text-slate-400">{templateNo}</span>
            )}
          </div>
          <p className="text-xs text-gray-500">
            画像の追加・差し替えは業務システムの設定で行います（
            <a
              href={BIZ_TEMPLATE_SETTINGS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline"
            >
              設定を開く
            </a>
            ）
          </p>
        </div>

        <TextArea
          label="案内文"
          id="inspection-notice"
          rows={3}
          placeholder="掲示板に表示する案内文を入力"
          value={noticeText}
          onChange={(e) => setNoticeText(e.target.value)}
        />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="rounded border-gray-300"
            checked={showOnBoard}
            onChange={(e) => setShowOnBoard(e.target.checked)}
          />
          <span className="text-gray-700">掲示板に表示</span>
        </label>

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="secondary" type="button" onClick={onClose}>
            キャンセル
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
