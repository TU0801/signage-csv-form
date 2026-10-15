import type { ReactNode } from 'react';

interface MasterToolbarProps {
  count: number;
  search: ReactNode;
  note?: ReactNode;
  action?: ReactNode;
}

/** 件数・検索・案内・追加ボタンの並び（v1: admin.html .master-toolbar） */
export function MasterToolbar({ count, search, note, action }: MasterToolbarProps) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-gray-600 whitespace-nowrap">{count}件</span>
        <div className="flex-1 min-w-[12rem] max-w-md">{search}</div>
        {action}
      </div>
      {note && <p className="text-sm text-gray-500">{note}</p>}
    </div>
  );
}
