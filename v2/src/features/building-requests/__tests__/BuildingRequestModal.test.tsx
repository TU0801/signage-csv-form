import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAuthStore } from '@/stores/authStore';
import type { DbProfile } from '@/types/database';

vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {}, RPC: {} }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock('@/lib/api/masterData', () => ({
  fetchMasterVendors: async () => [
    { id: 'v1', vendor_name: '保守A' },
    { id: 'v2', vendor_name: '保守B' },
  ],
  fetchMasterInspectionTypes: async () => [{ id: 't9', inspection_name: '全体の種別' }],
}));
const api = vi.hoisted(() => ({
  createPropertyRequest: vi.fn(async (input: { propertyName: string }) => ({
    id: 'r1',
    property_name: input.propertyName.trim(),
    status: 'pending',
  })),
}));
vi.mock('@/lib/api/property-requests', () => ({
  createPropertyRequest: api.createPropertyRequest,
  fetchManagementCompaniesForRequest: async () => [
    { id: '11111111-1111-4111-8111-111111111111', name: '管理X' },
    { id: '22222222-2222-4222-8222-222222222222', name: '管理Y' },
  ],
  fetchMyPropertyRequests: async () => [],
  // 保守会社に紐付いた点検種別（点検種別マスターの並び順）。先頭が既定
  fetchVendorInspectionTypeOptions: async (vendorId: string) =>
    vendorId === 'v1'
      ? [
          { id: 't1', name: 'エレベーター' },
          { id: 't2', name: '消防' },
        ]
      : [],
  PROPERTY_REQUEST_STATUS_LABEL: { pending: '承認待ち', approved: '承認済み', rejected: '却下' },
}));

import { BuildingRequestModal, validatePropertyRequest } from '../components/BuildingRequestModal';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal ??= function () {};
  HTMLDialogElement.prototype.close ??= function () {};
  api.createPropertyRequest.mockClear();
});

describe('建物追加 申請の入力チェック', () => {
  it('保守会社・管理会社・建物名は必須、点検月を入れるなら点検種別も要る', () => {
    expect(
      validatePropertyRequest({
        vendorId: '',
        managementCompanyId: '',
        propertyName: ' ',
        inspectionTypeId: '',
        inspectionMonths: [4],
      }),
    ).toEqual({
      vendor: '保守会社を選んでください',
      managementCompany: '管理会社を選んでください',
      propertyName: '建物名を入力してください',
      inspectionType: '点検月を入れるときは点検種別を選んでください',
    });
    expect(
      validatePropertyRequest({
        vendorId: 'v1',
        managementCompanyId: 'm1',
        propertyName: 'A',
        inspectionTypeId: '',
        inspectionMonths: [],
      }),
    ).toEqual({});
  });
});

describe('BuildingRequestModal（保守会社アカウント）', () => {
  it('保守会社は自社に固定・管理会社はフィルターの値・点検種別は紐付けの先頭が既定で、申請後に案内を出す', async () => {
    useAuthStore.setState({ profile: { id: 'u1', role: 'user', vendor_id: 'v1' } as DbProfile });
    render(
      <BuildingRequestModal
        open
        onClose={vi.fn()}
        vendorId="v2"
        managementCompanyId="22222222-2222-4222-8222-222222222222"
      />,
    );
    // props の vendorId（v2）ではなく自社（v1）。選べない
    await waitFor(() =>
      expect(screen.getByTestId('buildingRequestVendorFixed')).toHaveTextContent('保守A'),
    );
    expect(document.getElementById('buildingRequestVendor')).toBeNull();
    await waitFor(() =>
      expect(
        (document.getElementById('buildingRequestInspectionType') as HTMLSelectElement).value,
      ).toBe('t1'),
    );
    expect((document.getElementById('buildingRequestCompany') as HTMLSelectElement).value).toBe(
      '22222222-2222-4222-8222-222222222222',
    );

    fireEvent.change(document.getElementById('buildingRequestName')!, {
      target: { value: ' 新築マンション ' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: '4', hidden: true }));
    fireEvent.click(screen.getByRole('button', { name: '申請する', hidden: true }));

    await waitFor(() => expect(api.createPropertyRequest).toHaveBeenCalledTimes(1));
    expect(api.createPropertyRequest).toHaveBeenCalledWith({
      vendorId: 'v1',
      managementCompanyId: '22222222-2222-4222-8222-222222222222',
      propertyName: ' 新築マンション ',
      address: '',
      inspectionTypeId: 't1',
      inspectionMonths: [4],
    });
    expect(
      await screen.findByText('承認されると点検登録フォームに行が出ます。'),
    ).toBeInTheDocument();
  });
});
