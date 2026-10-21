import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { TreeBuildingNode, TreeSelection } from '../lib/documents';

interface ReportTreeProps {
  tree: TreeBuildingNode[];
  total: number;
  selection: TreeSelection | null;
  onSelect: (selection: TreeSelection | null) => void;
}

function sameSelection(a: TreeSelection | null, b: TreeSelection | null): boolean {
  return (
    a?.propertyCode === b?.propertyCode && a?.year === b?.year && a?.inspectionType === b?.inspectionType
  );
}

/** 建物 → 年 → 点検種別の仮想ツリー（DocFlow と同じ並び）。選んだノードで右の表を絞る */
export function ReportTree({ tree, total, selection, onSelect }: ReportTreeProps) {
  // 開いている建物・年（閉じても選択は残る。表の絞り込みは選択で決まる）
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const item = (label: string, count: number, sel: TreeSelection | null, depth: number, toggleKey?: string, open?: boolean) => (
    <div className="flex items-center" style={{ paddingLeft: `${depth * 0.75}rem` }}>
      {toggleKey ? (
        <button
          type="button"
          aria-label={open ? '閉じる' : '開く'}
          onClick={() => toggle(toggleKey)}
          className="w-4 shrink-0 text-gray-400 hover:text-gray-700"
        >
          {open ? '▾' : '▸'}
        </button>
      ) : (
        <span className="w-4 shrink-0" />
      )}
      <button
        type="button"
        onClick={() => onSelect(sel)}
        aria-current={sameSelection(selection, sel) ? 'true' : undefined}
        className={cn(
          'flex min-w-0 flex-1 items-center justify-between gap-1 rounded px-1 py-0.5 text-left',
          sameSelection(selection, sel) ? 'bg-blue-100 text-blue-900' : 'hover:bg-gray-100',
        )}
      >
        <span className="truncate" title={label}>
          {label}
        </span>
        <span className="shrink-0 text-gray-400">{count}</span>
      </button>
    </div>
  );

  return (
    <nav aria-label="報告書のフォルダ" className="space-y-px text-xs">
      {item('すべて', total, null, 0)}
      {tree.map((b) => {
        const bKey = b.propertyCode;
        const bOpen = expanded.has(bKey);
        return (
          <div key={bKey}>
            {item(b.propertyName || b.propertyCode, b.count, { propertyCode: b.propertyCode }, 0, bKey, bOpen)}
            {bOpen &&
              b.years.map((y) => {
                const yKey = `${bKey}/${y.year}`;
                const yOpen = expanded.has(yKey);
                return (
                  <div key={yKey}>
                    {item(`${y.year}年`, y.count, { propertyCode: b.propertyCode, year: y.year }, 1, yKey, yOpen)}
                    {yOpen &&
                      y.types.map((t) => (
                        <div key={t.label}>
                          {item(
                            t.label,
                            t.count,
                            { propertyCode: b.propertyCode, year: y.year, inspectionType: t.label },
                            2,
                          )}
                        </div>
                      ))}
                  </div>
                );
              })}
          </div>
        );
      })}
      {tree.length === 0 && <p className="px-1 py-2 text-gray-400">該当する報告書はありません</p>}
    </nav>
  );
}
