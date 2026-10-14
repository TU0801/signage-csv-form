import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** AppHeader のタイトル横の差し込み先（UserLayout が用意し、AppHeader が要素を登録する） */
export const HeaderSlotContext = createContext<{
  target: HTMLElement | null;
  setTarget: (el: HTMLElement | null) => void;
}>({ target: null, setTarget: () => {} });

/**
 * 画面ごとの部品をヘッダーのタイトル横に出す（管理者の保守会社セレクトなど）。
 * v1: index.html / bulk.html の header 内 #adminVendorSelectGroup（780f151 でヘッダーへ移した配置）
 */
export function HeaderSlot({ children }: { children: ReactNode }) {
  const { target } = useContext(HeaderSlotContext);
  return target ? createPortal(children, target) : null;
}
