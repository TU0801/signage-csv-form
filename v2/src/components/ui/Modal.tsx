import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { pushTopLayerHost, removeTopLayerHost } from './topLayerHost';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** 本文の下に固定して出す操作（保存・キャンセルなど）。本文だけがスクロールし、ここは常に見える */
  footer?: ReactNode;
  className?: string;
  /**
   * 保存していない変更があるか。true の間は Escape・背景クリック・× ですぐ閉じず、
   * 「破棄して閉じますか？」の確認を dialog の中に出す（破棄して閉じる → onClose）。
   * footer のキャンセルなど呼び出し側のボタンは明示的な破棄として扱い、確認しない。
   */
  dirty?: boolean;
  /**
   * 処理中（送信の途中など）で閉じてはいけないか。true の間は Escape・背景クリック・× で閉じない
   * （確認も出さない）。footer のボタンは呼び出し側で無効にする
   */
  busy?: boolean;
  /**
   * 見出しを引いてモーダルを動かせるようにする（後ろの表を見ながら入力するもの。修正依頼1027(1) 報告書の再提出）。
   * 既定は false（動かない）。開くたびに中央へ戻す
   */
  draggable?: boolean;
}

/** 開いたときにフォーカスする欄。[data-autofocus] が無ければ本文の最初の入力欄（チェックボックス等は除く） */
const FIRST_FIELD =
  'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([disabled]):not([readonly]),' +
  ' select:not([disabled]), textarea:not([disabled]):not([readonly])';

/**
 * 中央に出すモーダル（<dialog> の showModal）。見出し・本文（スクロール）・footer（固定）の 3 段。
 * 開くと本文の [data-autofocus] か最初の入力欄にフォーカスする。dirty で閉じる前の破棄確認を出す。
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  className,
  dirty = false,
  busy = false,
  draggable = false,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const backToEditRef = useRef<HTMLButtonElement>(null);
  // 押したのも背景のときだけ閉じる（入力欄の文字を選択したまま背景で離したときに閉じない）
  const pressedOnBackdrop = useRef(false);
  const [confirming, setConfirming] = useState(false);
  // 「破棄して閉じる」を押した後の close では確認を出さない
  const discardedRef = useRef(false);
  // 開き直したら前回の確認は消す（effect で setState しないよう描画中に合わせる）
  const [prevOpen, setPrevOpen] = useState(open);
  /** 見出しを引いて動かした量（中央からのずれ。draggable のときだけ） */
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setConfirming(false);
      setOffset({ x: 0, y: 0 });
    }
  }

  // 見出しを押したところから、離すまで window で動きを追う（速く動かして見出しから外れても付いてくる）
  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggable || e.button !== 0) return;
    if (e.target instanceof Element && e.target.closest('button')) return; // × は押せるままにする
    e.preventDefault();
    const start = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    // 枠（見出しから footer のボタンまで）が画面の外へ出ないよう、動かせる量を「画面 − 枠」の半分までに抑える
    const rect = dialogRef.current?.getBoundingClientRect();
    const limitX = Math.max(0, (window.innerWidth - (rect?.width ?? 0)) / 2);
    const limitY = Math.max(0, (window.innerHeight - (rect?.height ?? 0)) / 2);
    const move = (ev: PointerEvent) => {
      setOffset({
        x: Math.max(-limitX, Math.min(limitX, ev.clientX - start.x)),
        y: Math.max(-limitY, Math.min(limitY, ev.clientY - start.y)),
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      discardedRef.current = false;
      if (!dialog.open) dialog.showModal();
      pushTopLayerHost(dialog);
      // showModal() は最初のボタン（×）にフォーカスするので、入力欄へ移し直す
      const body = bodyRef.current;
      const target = body?.querySelector<HTMLElement>('[data-autofocus]') ?? body?.querySelector<HTMLElement>(FIRST_FIELD);
      target?.focus();
    } else {
      dialog.close();
      removeTopLayerHost(dialog);
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    return () => {
      if (dialog) removeTopLayerHost(dialog);
    };
  }, []);

  const showDiscardConfirm = confirming && dirty;
  useEffect(() => {
    if (showDiscardConfirm) backToEditRef.current?.focus();
  }, [showDiscardConfirm]);

  const requestClose = () => {
    if (busy) return;
    if (dirty) setConfirming(true);
    else onClose();
  };

  const discardAndClose = () => {
    discardedRef.current = true;
    setConfirming(false);
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      // Escape は cancel → close の順に来る。変更があれば cancel を止めて確認を出す
      // cancel / close は React の木を伝わって上がるので、中に入れたモーダル（確認ダイアログ等）のものは無視する
      onCancel={(e) => {
        if (e.target !== e.currentTarget) return;
        if (busy) {
          e.preventDefault();
          return;
        }
        if (dirty && !discardedRef.current) {
          e.preventDefault();
          setConfirming(true);
        }
      }}
      onClose={(e) => {
        if (e.target !== e.currentTarget) return;
        // Chrome は Escape の連打などで cancel の preventDefault を無視して閉じることがある。開いたままのはずなら開き直す
        // （open=false で親が閉じたときの close はそのまま onClose へ）
        const dialog = dialogRef.current;
        if (open && busy && dialog) {
          dialog.showModal();
          return;
        }
        if (open && dirty && !discardedRef.current && dialog) {
          dialog.showModal();
          setConfirming(true);
          return;
        }
        onClose();
      }}
      // 背景（::backdrop）のクリックは dialog 自身への click になる。中身は内側の div が受けるので閉じない
      // （dialog に padding を付けると余白のクリックでも閉じるため p-0 のままにする）。v1: 各モーダルの overlay click
      onMouseDown={(e) => {
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedOnBackdrop.current) requestClose();
        pressedOnBackdrop.current = false;
      }}
      // m-auto: preflight と親の space-y-* が dialog 既定の margin:auto を消すので中央寄せを明示する
      // max-w-lg は呼び出し側が max-w-* を渡さないときだけ（cn は結合のみで、両方あると CSS の並び順で max-w-lg が勝つ）
      // 動かした量は translate で中央（m-auto）からずらす
      style={draggable && (offset.x || offset.y) ? { translate: `${offset.x}px ${offset.y}px` } : undefined}
      className={cn(
        'm-auto rounded-lg shadow-xl backdrop:bg-black/50 p-0 w-full',
        !/(^|\s)max-w-/.test(className ?? '') && 'max-w-lg',
        className,
      )}
    >
      {/* 見出しと footer はスクロールの外に置き、本文だけを画面の高さに合わせてスクロールさせる。
          flex は内側の div に付ける（dialog に付けると閉じているときの display:none を上書きして常時表示になる）。
          高さの上限は dialog の UA 既定（100% - 2em - 6px）より小さくし、dialog 自体はスクロールさせない */}
      <div className="relative flex max-h-[calc(100dvh-2.5rem)] flex-col">
        {title && (
          <div
            className={cn(
              'flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2',
              draggable && 'cursor-move select-none touch-none',
            )}
            onPointerDown={draggable ? startDrag : undefined}
            title={draggable ? '見出しを引いて動かせます' : undefined}
          >
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <button
              type="button"
              aria-label="閉じる"
              onClick={requestClose}
              disabled={busy}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none disabled:opacity-40 disabled:hover:text-gray-400"
            >
              &times;
            </button>
          </div>
        )}
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {children}
        </div>
        {footer && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-gray-200 px-4 py-2">{footer}</div>
        )}
        {/* 破棄の確認は window.confirm を使わず、モーダル全体を覆って出す（入力中の内容は裏に残す） */}
        {showDiscardConfirm && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/85 p-4">
            <div role="alert" className="space-y-3 rounded-md border border-yellow-300 bg-yellow-50 px-4 py-3 shadow-sm">
              <p className="text-sm text-yellow-900">保存していない変更があります。破棄して閉じますか？</p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  ref={backToEditRef}
                  onClick={() => setConfirming(false)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
                >
                  編集に戻る
                </button>
                <button
                  type="button"
                  onClick={discardAndClose}
                  className="rounded-md bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
                >
                  破棄して閉じる
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
