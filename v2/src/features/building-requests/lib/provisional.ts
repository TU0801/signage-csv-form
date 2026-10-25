import { todayJst } from '@/features/inspection-portal/lib/schedule';
import type { DbPropertyRequest } from '@/types/database';
import type { MasterProperty } from '@/types/app';

/*
 * 未承認の建物（建物追加の申請）を点検登録フォームで使う（修正依頼1025 F2・D4）。
 * 申請を出した時点で、その建物の行を『＋行を追加』と同じ手の行として入力・申請できる。
 * 申請（signage_entries）は仮の物件コード REQ-<申請 id の先頭8文字> と property_request_id で入り、
 * 建物の承認で正式な物件コードに付け替わる。建物が承認されるまで掲示の申請は承認できない（DB の guard_entry_property_request）。
 * 使えるのは申請した月（日本時間）の間だけ。翌月以降は再申請が要る（注記「次回以降は承認がなければ再度申請」。DB も同じ規則）。
 */

/** 仮の物件コードの頭（DB の guard_entry_property_request・approve_property_request と同じ） */
export const PROVISIONAL_PREFIX = 'REQ-';

/** 物件の候補・表に出す未承認の建物の印 */
export const PROVISIONAL_LABEL = '建物未承認';

/** 申請の仮の物件コード（DB と同じ: 'REQ-' || left(id::text, 8)） */
export function provisionalCode(requestId: string): string {
  return `${PROVISIONAL_PREFIX}${requestId.slice(0, 8)}`;
}

export function isProvisionalCode(code: string | null | undefined): boolean {
  return !!code && code.toUpperCase().startsWith(PROVISIONAL_PREFIX);
}

/** 申請した月（日本時間 YYYY-MM） */
function requestMonthJst(createdAt: string): string {
  return todayJst(new Date(createdAt)).slice(0, 7);
}

/** 点検登録フォームで使える未承認の建物か（承認待ちで、申請した月が今月＝日本時間） */
export function isUsableRequest(r: Pick<DbPropertyRequest, 'status' | 'created_at'>, now: Date = new Date()): boolean {
  return r.status === 'pending' && requestMonthJst(r.created_at) === todayJst(now).slice(0, 7);
}

/** 点検登録フォームの物件の候補に足す未承認の建物（端末は無い） */
export interface ProvisionalBuilding {
  propertyCode: string;
  propertyName: string;
  requestId: string;
  managementCompanyId: string;
  inspectionTypeId: string | null;
}

export function provisionalBuildings(requests: DbPropertyRequest[], now: Date = new Date()): ProvisionalBuilding[] {
  return requests
    .filter((r) => isUsableRequest(r, now))
    .map((r) => ({
      propertyCode: provisionalCode(r.id),
      propertyName: `【${PROVISIONAL_LABEL}】${r.property_name}`,
      requestId: r.id,
      managementCompanyId: r.management_company_id,
      inspectionTypeId: r.inspection_type_id,
    }));
}

/**
 * 承認済みの建物の仮のコード → 正式な物件コード・端末（自動保存から戻した行を、承認後の物件に付け替えるため）
 */
export function approvedCodeMap(
  requests: DbPropertyRequest[],
): Map<string, { propertyCode: string; terminalId: string }> {
  const map = new Map<string, { propertyCode: string; terminalId: string }>();
  requests.forEach((r) => {
    if (r.status === 'approved' && r.created_property_code) {
      map.set(provisionalCode(r.id), {
        propertyCode: r.created_property_code,
        terminalId: r.created_terminal_id ?? '',
      });
    }
  });
  return map;
}

/** 1件入力の物件の候補にする形（端末・点検行は無い。id は申請 id） */
export function provisionalMasterProperty(b: ProvisionalBuilding): MasterProperty {
  return { id: b.requestId, property_code: b.propertyCode, property_name: b.propertyName, terminals: [], inspections: [] };
}
