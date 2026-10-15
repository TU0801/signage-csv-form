import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Combobox, type ComboboxOption } from '../Combobox';

const options: ComboboxOption[] = [
  { value: 'A001', label: 'テストマンション', hint: 'A001' },
  { value: 'A002', label: 'サンプルハイツ', hint: 'A002' },
  { value: 'A003', label: 'テスト第二ビル', hint: 'A003' },
];

function Harness({ onChange }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState('A002');
  return (
    <Combobox
      label="物件コード"
      required
      value={value}
      options={options}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

describe('Combobox', () => {
  it('ラベル（required で " *"）が名前になり、閉じているときは選択中のラベルを出す', () => {
    render(<Harness />);
    const input = screen.getByRole('combobox', { name: '物件コード *' });
    expect(input).toHaveValue('サンプルハイツ');
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('ひらがなでカタカナの候補を絞り込める', () => {
    render(<Harness />);
    const input = screen.getByRole('combobox', { name: '物件コード *' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'てすと' } });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'テストマンションA001',
      'テスト第二ビルA003',
    ]);
  });

  it('↓ と Enter で選ぶ。IME 変換中の Enter では選ばない', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByRole('combobox', { name: '物件コード *' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'テスト' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1]!.id);
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('A003');
    expect(input).toHaveValue('テスト第二ビル');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('Escape で閉じて選択中のラベルに戻し、外へ伝えない', () => {
    const outer = vi.fn();
    const onChange = vi.fn();
    render(
      <div onKeyDown={outer}>
        <Harness onChange={onChange} />
      </div>,
    );
    const input = screen.getByRole('combobox', { name: '物件コード *' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'テスト' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('サンプルハイツ');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(outer).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('候補に無い値はそのまま出し、0 件なら emptyText を出す', () => {
    render(<Combobox label="点検種別" value="旧種別" options={options} onChange={() => {}} emptyText="見つかりません" />);
    const input = screen.getByRole('combobox', { name: '点検種別' });
    expect(input).toHaveValue('旧種別');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.getByText('見つかりません')).toBeTruthy();
  });

  it('フォーカスだけでは開かず、打つ・クリック・↓ で開く', () => {
    render(<Harness />);
    const input = screen.getByRole('combobox', { name: '物件コード *' });
    act(() => input.focus());
    expect(document.activeElement).toBe(input);
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).toBeNull();

    fireEvent.change(input, { target: { value: 'さんぷる' } });
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['サンプルハイツA002']);

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.click(input);
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('Safari の変換確定 Enter（compositionend の後・keyCode 229）では選ばない', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByRole('combobox', { name: '物件コード *' });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'てすと' } });
    // 変換中のキー
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.compositionEnd(input);
    // Safari: compositionend の後に isComposing=false で来る確定 Enter（keyCode 229 と、13 で来る場合の両方）
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeTruthy();
    // 確定の後の Enter では選ぶ
    fireEvent.keyUp(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });
    expect(onChange).toHaveBeenCalledWith('A001');
  });

  it('ラベル・値・hint のそれぞれで探し、境目をまたいでは当たらない', () => {
    const opts: ComboboxOption[] = [
      { value: '101', label: 'A棟' },
      { value: 'X9', label: 'B棟', hint: 'ひがし' },
    ];
    render(<Combobox aria-label="部屋" value="" options={opts} onChange={() => {}} />);
    const input = screen.getByRole('combobox', { name: '部屋' });
    const labels = () => screen.queryAllByRole('option').map((o) => o.textContent);
    fireEvent.change(input, { target: { value: '棟1' } });
    expect(labels()).toEqual([]);
    fireEvent.change(input, { target: { value: '101' } });
    expect(labels()).toEqual(['A棟']);
    fireEvent.change(input, { target: { value: 'ヒガシ' } });
    expect(labels()).toEqual(['B棟ひがし']);
  });
});
