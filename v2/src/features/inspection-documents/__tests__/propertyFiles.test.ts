import { describe, expect, it } from 'vitest';
import { canDeletePropertyFile } from '../lib/propertyFiles';
import { makePropertyFile } from './fixtures';

describe('canDeletePropertyFile（修正依頼1029 決定②: 上げた会社も削除できる）', () => {
  it('管理者・上げた本人・同じ保守会社・自社物件の管理会社（保守会社の無いファイル）に出し、他社には出さない', () => {
    const byVendor = makePropertyFile({ uploaded_by: 'u-other', vendor_id: 'v1', management_company_id: 'm1' });
    expect(canDeletePropertyFile(byVendor, { isAdmin: false, userId: 'u1', vendorId: 'v1' })).toBe(true);
    expect(canDeletePropertyFile(byVendor, { isAdmin: false, userId: 'u1', vendorId: 'v2' })).toBe(false);
    expect(canDeletePropertyFile(byVendor, { isAdmin: false, userId: 'u1', managementCompanyId: 'm1' })).toBe(false);
    const byMgmt = makePropertyFile({ uploaded_by: 'u-other', vendor_id: null, management_company_id: 'm1' });
    expect(canDeletePropertyFile(byMgmt, { isAdmin: false, userId: 'u1', managementCompanyId: 'm1' })).toBe(true);
    expect(canDeletePropertyFile(byMgmt, { isAdmin: true, userId: 'u1' })).toBe(true);
    expect(canDeletePropertyFile({ ...byVendor, status: 'deleted' }, { isAdmin: true, userId: 'u1' })).toBe(false);
  });
});

describe('canDeletePropertyFile は一覧の can_delete（DB の property_file_can_delete）に従う', () => {
  it('管理者が上げた保守会社なしのファイルは、自社物件の管理会社にも出さない', () => {
    const byAdmin = makePropertyFile({ uploaded_by: 'admin', vendor_id: null, management_company_id: 'm1', can_delete: false });
    expect(canDeletePropertyFile(byAdmin, { isAdmin: false, userId: 'u1', managementCompanyId: 'm1' })).toBe(false);
    const byMgmt = makePropertyFile({ uploaded_by: 'u-other', vendor_id: null, management_company_id: 'm1', can_delete: true });
    expect(canDeletePropertyFile(byMgmt, { isAdmin: false, userId: 'u1', managementCompanyId: 'm1' })).toBe(true);
    expect(canDeletePropertyFile({ ...byMgmt, status: 'deleted' }, { isAdmin: false, userId: 'u1', managementCompanyId: 'm1' })).toBe(false);
  });
});
