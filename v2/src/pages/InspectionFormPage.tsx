import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { InspectionPortal } from '@/features/inspection-portal/components/InspectionPortal';
import { BulkEntryPage } from '@/pages/BulkEntryPage';
import { SingleEntryPage } from '@/pages/SingleEntryPage';

export type FormMode = 'bulk' | 'single';

/** 1件入力・一括入力の切替（フォームの枠の左上に出す。修正依頼1024 B4） */
function ModeSwitch({ mode, onChange }: { mode: FormMode; onChange: (mode: FormMode) => void }) {
  const items: [FormMode, string][] = [
    ['single', '1件入力'],
    ['bulk', '一括入力'],
  ];
  return (
    <div className="inline-flex shrink-0 self-end rounded-md border border-gray-300 bg-white p-0.5" role="tablist" aria-label="入力の方法">
      {items.map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={mode === value}
          onClick={() => onChange(value)}
          className={cn(
            'rounded px-2.5 py-1 text-xs font-medium',
            mode === value ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * 点検登録フォーム（`/`。修正依頼1024 B3）。旧「1件入力」「一括入力」「点検一覧」をまとめた画面。
 * 保守会社・管理者: 一括入力（既定。点検予定・ステータス・報告書UP・完了連絡を含む）と1件入力を切り替える（?mode=single）。
 * 管理会社（入力できない）: 点検一覧（承認・差戻し・報告書の確認）
 */
export function InspectionFormPage() {
  const { isManagement } = useAuth();
  const [params, setParams] = useSearchParams();
  const mode: FormMode = params.get('mode') === 'single' ? 'single' : 'bulk';

  // ルートは全幅（UserLayout width="full" は余白を持たない）なので、ここで余白を付ける（上下は旧一括入力の main と同じ py-3）
  if (isManagement) {
    return (
      <div className="px-3 py-2">
        <InspectionPortal />
      </div>
    );
  }

  const switcher = (
    <ModeSwitch
      mode={mode}
      onChange={(next) => setParams(next === 'single' ? { mode: 'single' } : {}, { replace: true })}
    />
  );
  return (
    <div className="px-3 py-3 lg:px-4">
      {mode === 'single' ? <SingleEntryPage modeSwitch={switcher} /> : <BulkEntryPage modeSwitch={switcher} />}
    </div>
  );
}
