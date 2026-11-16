import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { BulkEntryPage } from '@/pages/BulkEntryPage';
import { SingleEntryPage } from '@/pages/SingleEntryPage';
import { ReportCheckPage } from '@/pages/ReportCheckPage';

export type FormMode = 'bulk' | 'single' | 'reports';

/** URL の ?mode=。知らない値・無しは一括入力 */
function modeOf(value: string | null): FormMode {
  return value === 'single' || value === 'reports' ? value : 'bulk';
}

/** 1件入力・一括入力・報告書確認の切替（フォームの枠の左上に出す。修正依頼1024 B4・1027） */
function ModeSwitch({ mode, onChange }: { mode: FormMode; onChange: (mode: FormMode) => void }) {
  const items: [FormMode, string][] = [
    ['single', '1件入力'],
    ['bulk', '一括入力'],
    ['reports', '報告書確認'],
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
 * 一括入力（既定。点検予定・ステータス・報告書UP・完了連絡を含む）と1件入力（?mode=single）、
 * 報告書確認（?mode=reports。申請不要の点検の報告書の届き具合。修正依頼1027）を切り替える。
 * 管理会社も同じ3画面で予定の入力と報告書の登録をする（修正依頼1115 (2)。完了連絡・建物追加の申請は出さない）。
 * 管理会社の点検一覧（承認・差戻し）は別ページ /portal/list（ヘッダーの「点検一覧」）
 */
export function InspectionFormPage() {
  const [params, setParams] = useSearchParams();
  const mode = modeOf(params.get('mode'));

  // ルートは全幅（UserLayout width="full" は余白を持たない）なので、ここで余白を付ける（上下は旧一括入力の main と同じ py-3）
  const switcher = (
    <ModeSwitch
      mode={mode}
      onChange={(next) => setParams(next === 'bulk' ? {} : { mode: next }, { replace: true })}
    />
  );
  return (
    <div className="px-3 py-3 lg:px-4">
      {mode === 'single' ? (
        <SingleEntryPage modeSwitch={switcher} />
      ) : mode === 'reports' ? (
        <ReportCheckPage modeSwitch={switcher} />
      ) : (
        <BulkEntryPage modeSwitch={switcher} />
      )}
    </div>
  );
}
