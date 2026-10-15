import { useSyncExternalStore } from 'react';

/**
 * 開いているモーダル <dialog> の積み重ね（後ろほど手前）。
 * showModal() 中は dialog の外がすべて inert になり、popover で上に出してもクリックは背景（dialog）に落ちて
 * モーダルが閉じる（Chromium で確認）。トーストのように モーダルの上で操作させたいものは、
 * 一番手前の dialog の中へ portal する。Modal が登録し、Toast が読む。
 */
let hosts: HTMLDialogElement[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function pushTopLayerHost(el: HTMLDialogElement) {
  hosts = [...hosts.filter((h) => h !== el), el];
  emit();
}

export function removeTopLayerHost(el: HTMLDialogElement) {
  if (!hosts.includes(el)) return;
  hosts = hosts.filter((h) => h !== el);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getTop = () => hosts[hosts.length - 1] ?? null;

/** 一番手前に開いているモーダルの dialog。無ければ null */
export function useTopLayerHost(): HTMLDialogElement | null {
  return useSyncExternalStore(subscribe, getTop, () => null);
}
