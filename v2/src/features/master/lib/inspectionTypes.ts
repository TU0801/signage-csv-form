import type { DbInspectionType, DbTemplateImage } from '@/types/database';
import { TEMPLATE_IMAGE_LABELS } from './templateImageLabels';

/** 一覧の「画像:」欄（固定表の表示名。表に無いキーはそのまま、未設定は「未設定」） */
// v1: js/admin-masters.js renderInspections（templateLabel）
export function templateLabel(templateNo: string | null | undefined): string {
  if (!templateNo) return '未設定';
  return TEMPLATE_IMAGE_LABELS[templateNo] || templateNo;
}

/** カテゴリの絞り込みで「未設定」を表すキー（カテゴリ名と重ならない値） */
export const NO_CATEGORY = '__no_category__';

/**
 * 一覧のカテゴリの絞り込みボタン。並びはカテゴリマスターの順 → マスターに無い名前（出てきた順）→ 未設定。
 * 件数が 0 のカテゴリは出さない。
 */
export function categoryTabs(
  items: Pick<DbInspectionType, 'category'>[],
  masterOrder: string[],
): { key: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const i of items) {
    const key = i.category || NO_CATEGORY;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const named = masterOrder.filter((n) => counts.has(n));
  const others = [...counts.keys()].filter((k) => k !== NO_CATEGORY && !named.includes(k));
  const keys = [...named, ...others, ...(counts.has(NO_CATEGORY) ? [NO_CATEGORY] : [])];
  return keys.map((key) => ({ key, label: key === NO_CATEGORY ? '未設定' : key, count: counts.get(key) ?? 0 }));
}

/**
 * 保存済みの template_no を選択肢のキーにそろえる。
 * 日時プレフィックス付き（例: "1124 235959cleaning"）は、末尾が一致するキーにする。
 */
// v1: js/admin-masters.js openMasterModal（templateKeyForSelect の抽出）
export function resolveTemplateKey(templateNo: string, keys: string[]): string {
  if (!templateNo || keys.includes(templateNo)) return templateNo;
  return keys.find((key) => templateNo.endsWith(key)) ?? templateNo;
}

export interface TemplateOptionGroup {
  label: string;
  options: { value: string; label: string; imageUrl?: string }[];
}

/**
 * テンプレート画像の選択肢。業務システムの画像（template_images_master）をカテゴリごとにまとめる。
 * 1件も読めなければ固定表を使う（グループ無し）。
 */
// v1: js/admin-masters.js openMasterModal（templateSelect の組み立て）
export function buildTemplateOptions(images: DbTemplateImage[]): TemplateOptionGroup[] {
  if (images.length > 0) {
    const groups = new Map<string, TemplateOptionGroup>();
    images.forEach((ti) => {
      const cat = ti.category || '未分類';
      const group = groups.get(cat) ?? { label: cat, options: [] };
      group.options.push({ value: ti.image_key, label: ti.display_name, imageUrl: ti.image_url });
      groups.set(cat, group);
    });
    return Array.from(groups.values());
  }
  return [
    {
      label: '',
      options: Object.entries(TEMPLATE_IMAGE_LABELS).map(([key, label]) => ({ value: key, label })),
    },
  ];
}

/**
 * ドラッグした行を落とした行の位置へ動かした後の並び。
 * 上から下へ動かすと落とした行の後ろ、下から上へ動かすと落とした行の前に入る。
 */
// v1: js/admin-masters.js handleInspectionDrop
export function moveItem(ids: string[], draggedId: string, targetId: string): string[] {
  const from = ids.indexOf(draggedId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = ids.filter((id) => id !== draggedId);
  next.splice(to, 0, draggedId);
  return next;
}

/**
 * 2行の位置だけを入れ替えた並び（↑↓ボタン用）。カテゴリの絞り込み中は表示上の隣が全体では離れていることがあり、
 * moveItem だと間の行がすべてずれて保存が何十件にもなるので、入れ替えにして保存を2行で済ませる
 */
export function swapItems(ids: string[], a: string, b: string): string[] {
  const i = ids.indexOf(a);
  const j = ids.indexOf(b);
  if (i < 0 || j < 0 || i === j) return ids;
  const next = [...ids];
  next[i] = b;
  next[j] = a;
  return next;
}

/**
 * 新しい並びの sort_order（上から 0, 1, 2…）。v1 は全行を書き直していたが、結果が同じなので値が変わる行だけを返す。
 */
// v1: js/admin-masters.js updateInspectionSortOrders
export function sortOrderUpdates(
  orderedIds: string[],
  items: Pick<DbInspectionType, 'id' | 'sort_order'>[],
): { id: string; sort_order: number }[] {
  const current = new Map(items.map((i) => [i.id, i.sort_order]));
  return orderedIds
    .map((id, index) => ({ id, sort_order: index }))
    .filter((u) => current.get(u.id) !== u.sort_order);
}
