import type { ReportPermissions } from '../lib/documents';

export type ReportAction = 'open' | 'download' | 'edit' | 'delete' | 'restore' | 'accept' | 'return' | 'resubmit';

interface ReportRowActionsProps {
  permissions: ReportPermissions;
  /** 保管庫へ移した版（開く・DL を出さず、その旨を出す） */
  archived: boolean;
  busy?: boolean;
  onAction: (action: ReportAction) => void;
}

const LINK = 'whitespace-nowrap rounded px-1 py-0.5 text-xs hover:bg-gray-100 disabled:opacity-50';

/** 1行の操作。何を出すかは reportPermissions（ロールと vendor_id）で決め、最終判断は DB の RPC に任せる */
export function ReportRowActions({ permissions: p, archived, busy, onAction }: ReportRowActionsProps) {
  const btn = (action: ReportAction, label: string, tone = 'text-blue-700') => (
    <button type="button" className={`${LINK} ${tone}`} disabled={busy} onClick={() => onAction(action)}>
      {label}
    </button>
  );
  return (
    <div className="flex flex-nowrap items-center gap-x-0.5">
      {archived ? (
        <span className="px-1 text-xs text-gray-500">保管庫へ移動済み</span>
      ) : (
        p.canOpen && (
          <>
            {btn('open', '開く')}
            {btn('download', 'DL')}
          </>
        )
      )}
      {p.canAccept && btn('accept', '受領', 'text-green-700')}
      {p.canReturn && btn('return', '差戻し', 'text-red-700')}
      {p.canResubmit && btn('resubmit', '再提出')}
      {p.canEdit && btn('edit', '編集', 'text-gray-700')}
      {p.canDelete && btn('delete', '削除', 'text-red-700')}
      {p.canRestore && btn('restore', '復元', 'text-gray-700')}
    </div>
  );
}
