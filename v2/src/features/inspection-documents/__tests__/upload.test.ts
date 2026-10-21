import { describe, expect, it } from 'vitest';
import { MAX_REPORT_BYTES, checkUpload, validateReportFile } from '../lib/upload';

const pdf = { name: 'a.pdf', type: 'application/pdf', size: 100 };

describe('validateReportFile', () => {
  it('拡張子と MIME の両方が PDF でなければ止める', () => {
    expect(validateReportFile(pdf)).toBeNull();
    expect(validateReportFile({ ...pdf, name: 'a.png' })).toMatch(/PDF/);
    expect(validateReportFile({ ...pdf, type: 'image/png' })).toMatch(/PDF/);
  });

  it('50MB を超えるもの・空のものを止める', () => {
    expect(validateReportFile({ ...pdf, size: MAX_REPORT_BYTES })).toBeNull();
    expect(validateReportFile({ ...pdf, size: MAX_REPORT_BYTES + 1 })).toMatch(/50MB/);
    expect(validateReportFile({ ...pdf, size: 0 })).toMatch(/空/);
  });
});

describe('checkUpload', () => {
  it('実施日は必須、未来日は警告（送信は止めない）', () => {
    expect(checkUpload({ file: pdf, performedOn: '' }, '2026-10-21').errors.performedOn).toBeTruthy();
    const future = checkUpload({ file: pdf, performedOn: '2026-10-22' }, '2026-10-21');
    expect(future.errors).toEqual({});
    expect(future.warnings).toHaveLength(1);
  });
});
