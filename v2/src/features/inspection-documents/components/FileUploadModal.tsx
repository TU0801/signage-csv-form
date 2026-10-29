import { useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocument } from 'pdf-lib';
import type { DbInspectionReport, PortalInspectionRow } from '@/types/portal';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { fetchInspectionReports, registerInspectionReport, sha256Hex, updateInspectionReport } from '@/lib/api/portal';
import { recordCorrections, registerPropertyFile } from '@/lib/api/property-files';
import { entryErrorReason } from '@/lib/api/admin-entries';
import { usePortalData } from '@/features/inspection-portal/hooks/usePortalData';
import { formatMonth, todayJst, typeFlagsMap } from '@/features/inspection-portal/lib/schedule';
import { buildUnitIndex } from '@/features/inspection-portal/lib/units';
import { buildReportFileName } from '../lib/fileName';
import { formatBytes, LIVE_STATUSES } from '../lib/documents';
import { validateReportFile } from '../lib/upload';
import { openPdfPages, type PdfPages } from '../lib/pdfPages';
import { extractPages, loadSourcePdf } from '../lib/pdfSplit';
import { buildSegments, buildTargets, identicalLiveReport } from '../lib/bulkSegments';
import {
  correctionRecord,
  postProcessOcr,
  suggestBreaks,
  type CorrectionRecord,
  type OcrSuggestion,
  type PropertyCandidate,
} from '../lib/aiOcr';
import {
  MAX_PROPERTY_FILE_BYTES,
  PROPERTY_FILE_ACCEPT,
  buildPropertyFileName,
  propertyCandidatesOf,
  propertyFileCategoryLabel,
  propertyFileMime,
  validatePropertyFile,
  vendorCandidatesOf,
} from '../lib/propertyFiles';
import { readImageForOcr, readPdfForOcr } from '../lib/runOcr';
import { UPLOAD_CATEGORIES, extractFromFileName, type UploadCategory } from '../lib/fileNameExtract';
import {
  EMPTY_ROW_STATE,
  applyBulk,
  buildRows,
  checkRow,
  isBlankPixels,
  liveReportsOf,
  mergeAuto,
  nameSlots,
  rowKey,
  rowTargetMonth,
  setFields,
  sourceKindOf,
  type BulkPatch,
  type RowCheck,
  type RowField,
  type RowInput,
  type RowState,
  type UploadRow,
  type UploadSource,
} from '../lib/uploadRows';
import { useAiOcr } from '../hooks/useAiOcr';
import { usePropertyFileTargets } from '../hooks/usePropertyFileTargets';
import { useUploadNameHints } from '../hooks/useUploadNameHints';
import { AiOcrControls, type OcrState } from './AiOcrControls';
import { StoredReportPreview } from './StoredReportPreview';
import { UploadPagesPane } from './UploadPagesPane';
import { UploadRowsTable, isRowFinished, type RowOptions, type RowResult } from './UploadRowsTable';
import { UploadBulkEdit } from './UploadBulkEdit';
import { RegisteredReportsPanel } from './RegisteredReportsPanel';

/**
 * どこから開いたか（修正依頼1029 決定①: 報告書一括アップロード・その他ファイル・行の報告書UP〔再提出〕・報告書の編集を
 * この1つの画面で開く。ボタンは今の場所に残し、開くときに区分・点検・物件・対象月などを入れておく）
 */
export type FileUploadPreset =
  /** 報告書一括アップロード（区分は報告書から） */
  | { kind: 'bulk' }
  /** その他ファイルアップロード（区分はファイル名から。物件を選んでおける） */
  | { kind: 'other'; propertyCode?: string | null }
  /** 点検の行の『報告書UP』・『再提出』（その点検・対象月を入れておき、登録済みの報告書を並べる） */
  | {
      kind: 'report';
      inspection: PortalInspectionRow;
      /** 何月分の点検か（YYYY-MM-01）。点検月の無い点検行は null（実施日の月になる） */
      targetMonth: string | null;
      entryId?: string | null;
      /** 差戻し後の再提出なら元の報告書（差戻し理由を見せる） */
      previous?: DbInspectionReport | null;
      /** 実施日の既定（行の点検開始日） */
      defaultPerformedOn?: string | null;
    }
  /** 点検報告書の画面の『編集』（その報告書の編集を開いておく。点検が分かれば同じ点検・対象月の報告書も並べる） */
  | { kind: 'edit'; report: DbInspectionReport; inspection?: PortalInspectionRow | null };

export interface FileUploadModalProps {
  open: boolean;
  preset: FileUploadPreset | null;
  onClose: () => void;
  /** 保守会社の絞り込みの既定（一括入力で選んでいる保守会社・保守会社アカウントの自社。管理者で全社なら null） */
  vendorId?: string | null;
  /** 登録・編集・削除をしたとき（呼び出し側の一覧を読み直す） */
  onChanged?: () => void;
  /** 選べる建物の追加の候補（呼び出し側が持つ点検の物件） */
  properties?: PropertyCandidate[];
}

/** 『ファイルアップロード』（修正依頼1029(1)）。開くたびに入力をやり直す */
export function FileUploadModal(props: FileUploadModalProps) {
  if (!props.open || !props.preset) return null;
  return <FileUploadDialog {...props} preset={props.preset} />;
}

/** 区間を切り出したもの（と SHA-256） */
interface Prepared {
  file: File;
  hash: string;
}

const NO_PROPERTIES: PropertyCandidate[] = [];
let sourceSeq = 0;

const presetLabel = (preset: FileUploadPreset) =>
  preset.kind === 'bulk'
    ? '報告書一括アップロード'
    : preset.kind === 'other'
      ? 'その他ファイルアップロード'
      : preset.kind === 'edit'
        ? '報告書の編集'
        : preset.previous
          ? '報告書の再提出'
          : '報告書のアップロード';

/** 開いたときに入れておく値のうち、ファイル名などで読めた値に黙って譲る既定（区分・保守会社の絞り込み） */
function presetDefaultsOf(preset: FileUploadPreset, vendorId: string | null | undefined): Partial<RowInput> {
  const base: Partial<RowInput> = vendorId ? { vendorId } : {};
  if (preset.kind === 'bulk') return { ...base, category: 'report' };
  if (preset.kind === 'other') return base;
  return {};
}

/** 開いたときに入れておく値（開いた行・選んだ建物。ファイル名などで読めた値と違えば要確認にする） */
function presetInputOf(preset: FileUploadPreset, vendorId: string | null | undefined): Partial<RowInput> {
  const base: Partial<RowInput> = vendorId ? { vendorId } : {};
  if (preset.kind === 'bulk') return {};
  if (preset.kind === 'other') return preset.propertyCode ? { propertyCode: preset.propertyCode } : {};
  const inspection = preset.kind === 'report' ? preset.inspection : (preset.inspection ?? null);
  const report = preset.kind === 'edit' ? preset.report : (preset.previous ?? null);
  const month = preset.kind === 'report' ? (preset.targetMonth ?? preset.previous?.target_month ?? null) : (report?.target_month ?? null);
  const performedOn = preset.kind === 'report' ? preset.defaultPerformedOn || preset.previous?.performed_on || '' : '';
  const out: Partial<RowInput> = {
    ...base,
    category: 'report',
    propertyCode: inspection?.property_code ?? report?.property_code ?? '',
    inspectionType: inspection?.inspection_type_label ?? report?.inspection_type_label ?? '',
    targetMonth: month ? month.slice(0, 7) : '',
    performedOn,
    managementCompanyId: inspection?.management_company_id ?? '',
  };
  // 保守会社は、絞り込みが無ければ点検の保守会社（同じ物件・点検種別に複数の保守会社があっても点検が1つに決まるように）
  if (!out.vendorId && inspection?.vendor_id) out.vendorId = inspection.vendor_id;
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v)) as Partial<RowInput>;
}

function FileUploadDialog({ preset, onClose, vendorId, onChanged, properties: extraProperties = NO_PROPERTIES }: FileUploadModalProps & { preset: FileUploadPreset }) {
  const { addToast } = useToast();
  const { isAdmin, isManagement, vendorId: myVendorId } = useAuth();
  const data = usePortalData();
  const hints = useUploadNameHints();
  const ai = useAiOcr();
  const today = todayJst();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- 開いたときに入れておく値 ----
  const [presetState] = useState<RowState>(() =>
    setFields(setFields(EMPTY_ROW_STATE, presetDefaultsOf(preset, vendorId), 'default'), presetInputOf(preset, vendorId), 'preset'),
  );
  const presetInspection = preset.kind === 'report' ? preset.inspection : preset.kind === 'edit' ? (preset.inspection ?? null) : null;
  const presetMonth =
    preset.kind === 'report'
      ? (preset.targetMonth ?? preset.previous?.target_month ?? null)
      : preset.kind === 'edit'
        ? preset.report.target_month
        : null;

  // ---- ファイルと区間 ----
  const [sources, setSources] = useState<UploadSource[]>([]);
  const [docs, setDocs] = useState<Record<string, PdfPages>>({});
  const bytesRef = useRef(new Map<string, Uint8Array>());
  const pdfLibRef = useRef(new Map<string, Promise<PDFDocument>>());
  const [rotations, setRotations] = useState<Record<string, Record<number, number>>>({});
  const [opening, setOpening] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [scanning, setScanning] = useState<Set<string>>(new Set());

  // ---- 行の入力 ----
  /** ファイルごとの既定（開いた値＋ファイル名＋書類全体の読み取り。区切りを足して増えた区間はこれから始まる） */
  const [baseStates, setBaseStates] = useState<Record<string, RowState>>({});
  const [states, setStates] = useState<Record<string, RowState>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeRowKey, setActiveRowKey] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<Record<string, RowResult>>({});
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const preparedRef = useRef(new Map<string, Prepared>());
  const [confirmReplace, setConfirmReplace] = useState<{ count: number; latest: DbInspectionReport[]; prepared: Map<string, Prepared> } | null>(null);

  // ---- 読み取り ----
  const [useAi, setUseAi] = useState(false);
  const [ocr, setOcr] = useState<Record<string, OcrState>>({});
  const ocrRawRef = useRef(new Map<string, unknown>());

  // ---- 登録済みの報告書（報告書UP・再提出・編集） ----
  const [overrides, setOverrides] = useState<Record<string, DbInspectionReport>>({});
  const [previewReportId, setPreviewReportId] = useState<string | null>(
    preset.kind === 'edit' ? preset.report.id : preset.kind === 'report' ? (preset.previous?.id ?? null) : null,
  );
  const [deleting, setDeleting] = useState<DbInspectionReport | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  // 閉じたら pdfjs の文書を片付ける。読み取りの結果は非同期で届くので、届いた時点のファイル・既定を ref で見る
  const docsRef = useRef(docs);
  const sourcesRef = useRef(sources);
  const baseStatesRef = useRef(baseStates);
  useEffect(() => {
    docsRef.current = docs;
    sourcesRef.current = sources;
    baseStatesRef.current = baseStates;
  }, [docs, sources, baseStates]);
  useEffect(() => () => Object.values(docsRef.current).forEach((d) => d.destroy()), []);

  const sourceMap = useMemo(() => Object.fromEntries(sources.map((s) => [s.id, s])), [sources]);
  const rows = useMemo(() => buildRows(sources), [sources]);
  const stateOf = (row: Pick<UploadRow, 'key' | 'sourceId'>): RowState => states[row.key] ?? baseStates[row.sourceId] ?? presetState;
  const effStates = useMemo(() => {
    const out: Record<string, RowState> = {};
    for (const r of rows) out[r.key] = states[r.key] ?? baseStates[r.sourceId] ?? presetState;
    return out;
  }, [rows, states, baseStates, presetState]);

  // ---- 選択肢 ----
  const inspectionCandidates = useMemo(() => propertyCandidatesOf(data.inspections), [data.inspections]);
  const fallbackProperties = useMemo(() => [...extraProperties, ...inspectionCandidates], [extraProperties, inspectionCandidates]);
  const fileTargets = usePropertyFileTargets(fallbackProperties);
  const options = useMemo<RowOptions>(() => {
    const props = new Map<string, string>();
    for (const p of [...fileTargets, ...hints.properties]) if (!props.has(p.code)) props.set(p.code, p.name);
    const mgmt = new Map<string, { name: string; hint?: string }>();
    for (const m of hints.managementCompanies) mgmt.set(m.id, { name: m.name, hint: m.shortName ?? undefined });
    for (const i of data.inspections)
      if (i.management_company_id && !mgmt.has(i.management_company_id))
        mgmt.set(i.management_company_id, { name: i.management_company_name ?? i.management_company_id });
    const vendors = new Map<string, { name: string; hint?: string }>();
    for (const v of hints.vendors) vendors.set(v.id, { name: v.name, hint: v.shortName ?? undefined });
    for (const v of vendorCandidatesOf(data.inspections)) if (!vendors.has(v.id)) vendors.set(v.id, { name: v.name });
    const typesByProperty = new Map<string, Set<string>>();
    const allTypes = new Set<string>();
    for (const i of data.inspections) {
      const l = i.inspection_type_label ?? '';
      if (!l) continue;
      allTypes.add(l);
      typesByProperty.set(i.property_code, (typesByProperty.get(i.property_code) ?? new Set()).add(l));
    }
    const toOptions = (m: Map<string, { name: string; hint?: string }>) =>
      [...m.entries()].map(([value, v]) => ({ value, label: v.name, hint: v.hint })).sort((a, b) => a.label.localeCompare(b.label, 'ja'));
    return {
      properties: [...props.entries()]
        .map(([value, label]) => ({ value, label, hint: value }))
        .sort((a, b) => a.label.localeCompare(b.label, 'ja') || a.value.localeCompare(b.value)),
      inspectionTypesOf: (code: string) =>
        [...(code && typesByProperty.get(code) ? typesByProperty.get(code)! : allTypes)]
          .sort((a, b) => a.localeCompare(b, 'ja'))
          .map((l) => ({ value: l, label: l })),
      managementCompanies: toOptions(mgmt),
      vendors: toOptions(vendors),
      // 管理会社は報告書を登録できない（その他ファイルだけ）
      categories: isManagement ? UPLOAD_CATEGORIES.filter((c) => c.value !== 'report') : UPLOAD_CATEGORIES,
    };
  }, [fileTargets, hints, data.inspections, isManagement]);
  const propertyAliasOf = useMemo(() => new Map(hints.properties.map((p) => [p.code, p])), [hints.properties]);
  const nameCtx = useMemo(
    () => ({
      properties: hints.properties.length
        ? hints.properties
        : options.properties.map((o) => ({ code: o.value, name: o.label, aliases: [], managementCompanyId: null })),
      vendors: hints.vendors.length ? hints.vendors : vendorCandidatesOf(data.inspections).map((v) => ({ ...v, shortName: null })),
      managementCompanies: hints.managementCompanies,
      inspectionTypes: [...new Set(data.inspections.map((i) => i.inspection_type_label ?? '').filter(Boolean))],
    }),
    [hints, options.properties, data.inspections],
  );
  /** OCR の照合に使う物件（業務システムの名前・略称も、同じ物件コードの別名として入れる） */
  const ocrProperties = useMemo<PropertyCandidate[]>(() => {
    const out: PropertyCandidate[] = [];
    const seen = new Set<string>();
    for (const p of nameCtx.properties)
      for (const name of [p.name, ...p.aliases]) {
        const k = `${p.code}\u0000${name}`;
        if (!seen.has(k)) {
          seen.add(k);
          out.push({ code: p.code, name });
        }
      }
    return out;
  }, [nameCtx.properties]);

  // ---- 報告書の点検・申請の紐付け ----
  const entryIdOf = useMemo(() => {
    const targets = buildTargets(data.inspections, data.entries, data.reports, null, today, 3, {
      flags: typeFlagsMap(data.typeFlags),
      units: buildUnitIndex(data.units),
    });
    return new Map(targets.filter((t) => t.targetMonth).map((t) => [`${t.inspection.inspection_id}:${t.targetMonth}`, t.entryId]));
  }, [data.inspections, data.entries, data.reports, data.typeFlags, data.units, today]);

  const allReports = useMemo(() => {
    const list = data.reports.map((r) => overrides[r.id] ?? r);
    if (preset.kind === 'edit' && !list.some((r) => r.id === preset.report.id)) list.push(overrides[preset.report.id] ?? preset.report);
    return list;
  }, [data.reports, overrides, preset]);

  const checks = useMemo(() => {
    const out: Record<string, RowCheck> = {};
    for (const r of rows) {
      const source = sourceMap[r.sourceId];
      const size = sizes[r.key] ?? (source && (source.kind !== 'pdf' || r.pages.length === source.pageCount) ? source.file.size : null);
      out[r.key] = checkRow(r, effStates[r.key] ?? presetState, { inspections: data.inspections, source, size, canReport: !isManagement });
    }
    return out;
  }, [rows, sourceMap, sizes, effStates, presetState, data.inspections, isManagement]);

  const existingCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of rows) {
      const insp = checks[r.key]?.inspection;
      const st = effStates[r.key];
      if (insp && st) out[r.key] = liveReportsOf(allReports, insp.inspection_id, rowTargetMonth(st.input)).length;
    }
    return out;
  }, [rows, checks, effStates, allReports]);

  const derivedNames = useMemo(() => {
    const out: Record<string, { vendor: string | null; management: string | null }> = {};
    for (const r of rows) {
      const insp = checks[r.key]?.inspection;
      const code = effStates[r.key]?.input.propertyCode ?? '';
      const mgmtId = propertyAliasOf.get(code)?.managementCompanyId ?? insp?.management_company_id ?? null;
      out[r.key] = {
        vendor: insp?.vendor_name ?? null,
        management: mgmtId ? (options.managementCompanies.find((o) => o.value === mgmtId)?.label ?? null) : null,
      };
    }
    return out;
  }, [rows, checks, effStates, propertyAliasOf, options.managementCompanies]);

  /** 登録済みの区間があるファイル（区切り・回転・削除を変えない） */
  const lockedSources = useMemo(
    () => new Set(rows.filter((r) => isRowFinished(results[r.key])).map((r) => r.sourceId)),
    [rows, results],
  );
  const pendingRows = rows.filter((r) => !isRowFinished(results[r.key]) && !checks[r.key]?.skip);
  const allDone = rows.length > 0 && pendingRows.length === 0;
  const reviewCount = pendingRows.filter((r) => checks[r.key]?.needsReview).length;

  // ---- 行の入力の変更 ----
  const updateRow = (key: string, sourceId: string, fn: (s: RowState) => RowState) =>
    setStates((prev) => ({ ...prev, [key]: fn(prev[key] ?? baseStates[sourceId] ?? presetState) }));
  const changeRow = (key: string, patch: Partial<RowInput>) => {
    const row = rows.find((r) => r.key === key);
    if (row) updateRow(key, row.sourceId, (s) => setFields(s, patch, 'manual'));
  };
  const takeConflict = (key: string, field: RowField) => {
    const row = rows.find((r) => r.key === key);
    const c = row ? stateOf(row).conflicts[field] : undefined;
    if (row && c) updateRow(key, row.sourceId, (s) => setFields(s, { [field]: c.value }, 'manual'));
  };
  const applyBulkEdit = (patch: BulkPatch) => {
    const keys = rows.filter((r) => selected.has(r.key) && !isRowFinished(results[r.key])).map((r) => r.key);
    setStates((prev) => applyBulk({ ...effStates, ...prev }, keys, patch));
    addToast(`${keys.length}行に入れました`, 'success');
  };

  // ---- ファイルを追加する（①）→ ファイル名から（②）→ 文字情報（③。PDF だけ、自動）／AI-OCR（④。チェックのとき） ----
  const addFiles = async (picked: FileList | File[] | null) => {
    if (!picked || picked.length === 0) return;
    const list = [...picked];
    for (const f of list) {
      const bad = validatePropertyFile(f);
      // PDF は 50MB を超えてもよい（区間ごとに 50MB 以下を確かめる）
      if (bad && !(bad.includes('大きすぎ') && propertyFileMime(f.name) === 'application/pdf')) {
        setFileError(`${f.name}: ${bad}`);
        return;
      }
    }
    setFileError(null);
    setPreviewReportId(null);
    for (const file of list) {
      const kind = sourceKindOf(file.name)!;
      const id = `f${++sourceSeq}`;
      const extraction = extractFromFileName(file, nameCtx);
      let base = mergeAuto(
        presetState,
        {
          category: extraction.category ?? undefined,
          propertyCode: extraction.propertyCode ?? undefined,
          vendorId: extraction.vendorId ?? undefined,
          managementCompanyId: extraction.managementCompanyId ?? undefined,
          inspectionType: extraction.inspectionType ?? undefined,
        },
        'filename',
      );
      if (extraction.performedOn) base = mergeAuto(base, { performedOn: extraction.performedOn }, extraction.performedOnSource ?? 'filename');
      setBaseStates((prev) => ({ ...prev, [id]: base }));
      let source: UploadSource = { id, file, kind, pageCount: 0, breaks: new Set(), removed: new Set() };
      if (kind === 'pdf') {
        setOpening((n) => n + 1);
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const pages = await openPdfPages(bytes.slice());
          bytesRef.current.set(id, bytes);
          setDocs((prev) => ({ ...prev, [id]: pages }));
          source = { ...source, pageCount: pages.pageCount };
          setSources((prev) => [...prev, source]);
          void runOcrFor(source, pages, useAi && ai.configured);
        } catch (err) {
          console.error('PDF open failed:', err);
          setFileError(
            `${file.name}: PDF を開けませんでした（壊れたファイル・パスワード付きの PDF は扱えません。ブラウザが古い場合は最新版に更新してください）`,
          );
        } finally {
          setOpening((n) => n - 1);
        }
      } else {
        setSources((prev) => [...prev, source]);
        if (useAi && ai.configured && kind === 'image') void runOcrFor(source, null, true);
      }
    }
  };

  const removeSource = (id: string) => {
    docs[id]?.destroy();
    setDocs((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== id)));
    bytesRef.current.delete(id);
    pdfLibRef.current.delete(id);
    setSources((prev) => prev.filter((s) => s.id !== id));
    setSelected((prev) => new Set([...prev].filter((k) => !k.startsWith(`${id}:`) && k !== id)));
  };

  const updateSource = (id: string, fn: (s: UploadSource) => UploadSource) => setSources((prev) => prev.map((s) => (s.id === id ? fn(s) : s)));
  const toggleBreak = (id: string, before: number) => {
    updateSource(id, (s) => {
      const breaks = new Set(s.breaks);
      if (breaks.has(before)) breaks.delete(before);
      else breaks.add(before);
      return { ...s, breaks };
    });
    // 区間の組み方が変わるので、前の失敗の表示は消す（別のページの区間に残さない）
    setResults((prev) => Object.fromEntries(Object.entries(prev).filter(([, r]) => r.state === 'ok' || r.state === 'skipped')));
  };
  const toggleRemoved = (id: string, page: number) =>
    updateSource(id, (s) => {
      const removed = new Set(s.removed);
      if (removed.has(page)) removed.delete(page);
      else removed.add(page);
      return { ...s, removed };
    });
  const rotate = (id: string, page: number, delta: number) =>
    setRotations((prev) => ({ ...prev, [id]: { ...prev[id], [page]: ((((prev[id]?.[page] ?? 0) + delta) % 360) + 360) % 360 } }));

  /** 空白ページを探して削除の印を付ける（文字が無く、小さく描いたページのほとんどが白いもの） */
  const findBlankPages = async (id: string) => {
    const source = sourceMap[id];
    const pages = docs[id];
    if (!source || !pages) return;
    setScanning((prev) => new Set(prev).add(id));
    try {
      const texts = await pages.pageTexts(source.pageCount);
      const blank: number[] = [];
      for (let p = 0; p < source.pageCount; p++) {
        if ((texts[p] ?? '').trim()) continue;
        const canvas = document.createElement('canvas');
        await pages.render(p, 0, canvas, 60);
        const ctx = canvas.getContext('2d');
        if (!ctx || canvas.width === 0 || canvas.height === 0) continue;
        if (isBlankPixels(ctx.getImageData(0, 0, canvas.width, canvas.height).data)) blank.push(p);
      }
      if (blank.length > 0) updateSource(id, (s) => ({ ...s, removed: new Set([...s.removed, ...blank]) }));
      addToast(
        blank.length > 0 ? `空白ページ ${blank.length}ページ（p.${blank.map((p) => p + 1).join('・')}）に削除の印を付けました` : '空白ページは見つかりませんでした',
        'info',
      );
    } catch (err) {
      console.error('Blank page scan failed:', err);
      addToast(`空白ページを探せませんでした: ${entryErrorReason(err)}`, 'error');
    } finally {
      setScanning((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // ---- 読み取り（③文字情報・④AI-OCR） ----
  const runOcrFor = async (source: UploadSource, pages: PdfPages | null, withAi: boolean) => {
    const bytes = bytesRef.current.get(source.id);
    if (source.kind === 'pdf' ? !pages || !bytes : !(withAi && source.kind === 'image')) return;
    setOcr((prev) => ({ ...prev, [source.id]: { state: 'running', useAi: withAi } }));
    try {
      const read = source.kind === 'pdf' ? await readPdfForOcr(pages!, bytes!.slice(), withAi) : await readImageForOcr(source.file);
      const suggestion = postProcessOcr(read.raw, {
        properties: ocrProperties,
        vendors: nameCtx.vendors.map((v) => ({ id: v.id, name: v.name })),
        inspectionTypes: nameCtx.inspectionTypes,
        dictionary: ai.dictionary,
        pageTexts: read.pageTexts,
      });
      ocrRawRef.current.set(source.id, read.raw);
      setOcr((prev) => ({ ...prev, [source.id]: { state: 'done', suggestion, mode: read.mode, pages: read.pages } }));
      applyOcr(source, suggestion, withAi ? 'ai' : 'text');
    } catch (err) {
      console.error('OCR failed:', err);
      setOcr((prev) => ({ ...prev, [source.id]: { state: 'error', message: entryErrorReason(err) } }));
    }
  };

  /** 読み取った結果を、まだ入れていない欄に入れる（建物が変わるページで区切る案も、区切りをまだ入れていないファイルだけ） */
  const applyOcr = (added: UploadSource, suggestion: OcrSuggestion, src: 'text' | 'ai') => {
    const id = added.id;
    // 追加した直後は state にまだ無いので、届いた時点のファイル（区切りを足していればそれ）を見る
    const source = sourcesRef.current.find((s) => s.id === id) ?? added;
    const docCategory: UploadCategory | undefined = /報告書/.test(suggestion.documentType)
      ? 'report'
      : suggestion.documentType && suggestion.documentType !== 'その他'
        ? suggestion.category
        : undefined;
    const patchFor = (pages: OcrSuggestion['pages'], whole: boolean): Partial<RowInput> => {
      const property = pages.find((p) => p.property)?.property ?? (whole ? suggestion.property : null);
      return {
        category: docCategory,
        categoryNote: docCategory === 'other' ? suggestion.categoryNote || undefined : undefined,
        propertyCode: property?.code,
        managementCompanyId: property ? (propertyAliasOf.get(property.code)?.managementCompanyId ?? undefined) : undefined,
        inspectionType: pages.find((p) => p.inspectionType)?.inspectionType ?? suggestion.inspectionType ?? undefined,
        performedOn: pages.find((p) => p.performedOn)?.performedOn ?? suggestion.performedOn ?? undefined,
        targetMonth: suggestion.targetMonth ? suggestion.targetMonth.slice(0, 7) : undefined,
        vendorId: suggestion.vendor?.id,
      };
    };
    const docPatch = patchFor(suggestion.pages, true);
    const base = mergeAuto(baseStatesRef.current[id] ?? presetState, docPatch, src);
    setBaseStates((prev) => ({ ...prev, [id]: mergeAuto(prev[id] ?? presetState, docPatch, src) }));
    let breaks = source.breaks;
    if (source.kind === 'pdf' && breaks.size === 0 && !lockedSources.has(id)) {
      const suggested = suggestBreaks(suggestion.pages, source.pageCount);
      if (suggested.size > 0) {
        breaks = suggested;
        updateSource(id, (s) => (s.breaks.size === 0 ? { ...s, breaks: suggested } : s));
      }
    }
    const segs = source.kind === 'pdf' ? buildSegments(source.pageCount, breaks) : [null];
    setStates((prev) => {
      const next = { ...prev };
      for (const seg of segs) {
        const key = rowKey(id, seg ? seg.start : null);
        const pages = seg ? suggestion.pages.filter((p) => p.page - 1 >= seg.start && p.page - 1 <= seg.end) : suggestion.pages;
        // 区間の入力がまだ無ければ、ファイルの既定（書類全体で読んだ値を含む）から始める
        next[key] = mergeAuto(next[key] ?? base, patchFor(pages, segs.length === 1), src);
      }
      return next;
    });
  };

  const runOcrAll = (withAi: boolean) => {
    for (const s of sources) {
      if (lockedSources.has(s.id)) continue;
      void runOcrFor(s, docs[s.id] ?? null, withAi);
    }
  };
  const ocrSummary: OcrState = useMemo(() => {
    const list = Object.values(ocr);
    const running = list.find((o) => o.state === 'running');
    if (running) return running;
    const err = list.find((o) => o.state === 'error');
    return err ?? list.find((o) => o.state === 'done') ?? { state: 'idle' };
  }, [ocr]);

  // ---- 送る ----
  const contentKeyOf = (row: UploadRow) => {
    const rot = rotations[row.sourceId] ?? {};
    return `${row.sourceId}|${row.pages.join(',')}|${row.pages.map((p) => rot[p] ?? 0).join(',')}`;
  };
  /** 区間を送る形にする（PDF の区間は切り出す。全ページ・回転なしなら元のファイルのまま） */
  const prepare = async (row: UploadRow): Promise<Prepared> => {
    const source = sourceMap[row.sourceId];
    if (!source) throw new Error('ファイルが見つかりません');
    const ck = contentKeyOf(row);
    const cached = preparedRef.current.get(ck);
    if (cached) return cached;
    let file: File;
    if (source.kind !== 'pdf') {
      // OS によって File.type が空・違う値になるので、拡張子から決めた MIME で置く
      const mime = propertyFileMime(source.file.name) ?? source.file.type;
      file = source.file.type === mime ? source.file : new File([source.file], source.file.name, { type: mime });
    } else {
      const rot = rotations[row.sourceId] ?? {};
      const whole = row.pages.length === source.pageCount && row.pages.every((p) => !rot[p]);
      if (whole) {
        file = source.file.type === 'application/pdf' ? source.file : new File([source.file], source.file.name, { type: 'application/pdf' });
      } else {
        const bytes = bytesRef.current.get(row.sourceId);
        if (!bytes) throw new Error('PDF を読み直せません');
        let docPromise = pdfLibRef.current.get(row.sourceId);
        if (!docPromise) {
          docPromise = loadSourcePdf(bytes);
          pdfLibRef.current.set(row.sourceId, docPromise);
        }
        let doc: PDFDocument;
        try {
          doc = await docPromise;
        } catch (err) {
          pdfLibRef.current.delete(row.sourceId);
          throw new Error(`PDF を切り出せませんでした（パスワード付きの PDF は扱えません）: ${entryErrorReason(err)}`, { cause: err });
        }
        const out = await extractPages(doc, row.pages, rot);
        const base = source.file.name.replace(/\.pdf$/i, '');
        const first = (row.pages[0] ?? 0) + 1;
        const last = (row.pages[row.pages.length - 1] ?? 0) + 1;
        file = new File([out as BlobPart], `${base}_p${first === last ? first : `${first}-${last}`}.pdf`, { type: 'application/pdf' });
      }
    }
    const prepared = { file, hash: source.kind === 'pdf' ? await sha256Hex(file) : '' };
    preparedRef.current.set(ck, prepared);
    setSizes((prev) => (prev[row.key] === file.size ? prev : { ...prev, [row.key]: file.size }));
    return prepared;
  };

  const handleSubmit = async () => {
    setTouched(true);
    if (pendingRows.length === 0) {
      addToast('登録する行がありません（ファイルを追加してください）', 'error');
      return;
    }
    if (reviewCount > 0) {
      addToast(`要確認の行が${reviewCount}行あります（赤い欄・詳細の食い違いを直してください）`, 'error');
      return;
    }
    setSubmitting(true);
    let latest: DbInspectionReport[] = allReports;
    const hasReport = pendingRows.some((r) => effStates[r.key]?.input.category === 'report');
    try {
      // 提出済みの版と同じ内容かを見比べるので、送る直前の報告書の一覧で数える（開いた後にほかの人が出した版も入れる）
      if (hasReport) latest = await fetchInspectionReports();
    } catch (err) {
      setSubmitting(false);
      addToast(`登録前の確認に失敗しました: ${entryErrorReason(err)}`, 'error');
      return;
    }
    const prepared = new Map<string, Prepared>();
    for (const r of pendingRows) {
      try {
        prepared.set(r.key, await prepare(r));
      } catch (err) {
        // 切り出せなかった区間は送信のときにもう一度試し、失敗を行の結果に出す
        console.error('Prepare failed:', err);
      }
    }
    setSubmitting(false);
    // 同じ点検・対象月に報告書があれば追加になる（同じ内容で送らない区間は数えない）
    const replacing = pendingRows.filter((r) => {
      const st = effStates[r.key];
      const insp = checks[r.key]?.inspection;
      if (!st || st.input.category !== 'report' || !insp) return false;
      const month = rowTargetMonth(st.input);
      const hash = prepared.get(r.key)?.hash;
      if (hash && identicalLiveReport(latest, insp.inspection_id, month, hash)) return false;
      return liveReportsOf(latest, insp.inspection_id, month).length > 0;
    }).length;
    if (replacing > 0) {
      setConfirmReplace({ count: replacing, latest, prepared });
      return;
    }
    await send(latest, prepared);
  };

  const send = async (latest: DbInspectionReport[], prepared: Map<string, Prepared>) => {
    setSubmitting(true);
    let ok = 0;
    let skipped = 0;
    let failed = 0;
    const okRows: UploadRow[] = [];
    // その他ファイルの名前（同じ「日付_建物_区分」になる行に _1・_2… を付ける）
    const otherRows = pendingRows.filter((r) => effStates[r.key]?.input.category && effStates[r.key]?.input.category !== 'report');
    const propertyName = (code: string) => options.properties.find((o) => o.value === code)?.label ?? '';
    const categoryLabelOf = (input: RowInput) =>
      propertyFileCategoryLabel({ category: input.category as Exclude<UploadCategory, 'report'>, category_note: input.category === 'other' ? input.categoryNote.trim() : null });
    const slots = nameSlots(
      otherRows.map((r) => {
        const input = effStates[r.key]!.input;
        return { key: r.key, base: `${input.performedOn}|${input.propertyCode}|${categoryLabelOf(input)}` };
      }),
    );
    for (const row of pendingRows) {
      const input = effStates[row.key]?.input;
      if (!input) continue;
      setResults((prev) => ({ ...prev, [row.key]: { state: 'running' } }));
      try {
        const pre = prepared.get(row.key) ?? (await prepare(row));
        if (pre.file.size > MAX_PROPERTY_FILE_BYTES) throw new Error(`ファイルが大きすぎます（50MB まで。区間を分けてください。${formatBytes(pre.file.size)}）`);
        if (input.category === 'report') {
          const insp = checks[row.key]?.inspection;
          if (!insp) throw new Error('点検が決まっていません');
          const invalid = validateReportFile(pre.file);
          if (invalid) throw new Error(`${invalid}（${formatBytes(pre.file.size)}）`);
          const month = rowTargetMonth(input);
          // 同じ点検に同じ内容の版が提出中・受領済みなら送らない（同じ PDF を出し直しても版が増え、受領がやり直しになるだけ）
          const same = identicalLiveReport(latest, insp.inspection_id, month, pre.hash);
          if (same) {
            skipped += 1;
            setResults((prev) => ({ ...prev, [row.key]: { state: 'skipped', otherMonth: same.target_month !== month ? same.target_month : null } }));
            continue;
          }
          const entryId =
            preset.kind === 'report' && presetInspection?.inspection_id === insp.inspection_id && (preset.targetMonth ?? null) === month
              ? (preset.entryId ?? null)
              : (entryIdOf.get(`${insp.inspection_id}:${month}`) ?? null);
          const report = await registerInspectionReport({
            inspectionId: insp.inspection_id,
            targetMonth: month,
            performedOn: input.performedOn,
            fileName: buildReportFileName({
              performedOn: input.performedOn,
              propertyName: insp.property_name,
              inspectionTypeLabel: insp.inspection_type_label ?? '',
            }),
            file: pre.file,
            entryId,
            note: input.note.trim() || null,
          });
          setResults((prev) => ({ ...prev, [row.key]: { state: 'ok', fileName: report.file_name } }));
        } else {
          const [index, total] = slots[row.key] ?? [0, 1];
          const category = input.category as Exclude<UploadCategory, 'report' | ''>;
          const saved = await registerPropertyFile({
            propertyCode: input.propertyCode,
            category,
            categoryNote: category === 'other' ? input.categoryNote.trim() : null,
            // 作業実施日があれば「作業実施日_建物名_区分」に付け替える（修正依頼1026 J4）
            fileName: buildPropertyFileName({
              docDate: input.performedOn,
              propertyName: propertyName(input.propertyCode),
              categoryLabel: categoryLabelOf(input),
              originalName: pre.file.name,
              index,
              total,
            }),
            file: pre.file,
            docDate: input.performedOn || null,
            note: input.note.trim() || null,
            ocrResult: ocrRawRef.current.get(row.sourceId) ?? null,
          });
          setResults((prev) => ({ ...prev, [row.key]: { state: 'ok', fileName: saved.file_name } }));
        }
        ok += 1;
        okRows.push(row);
      } catch (err) {
        failed += 1;
        console.error('Upload failed:', err);
        setResults((prev) => ({ ...prev, [row.key]: { state: 'error', message: entryErrorReason(err) } }));
      }
    }
    setSubmitting(false);
    if (ok > 0) {
      onChanged?.();
      void data.refetch();
      void recordCorrections(correctionsFor(okRows));
    }
    const skippedNote = skipped > 0 ? `（${skipped}件は同じ内容の報告書が提出済みのため送っていません）` : '';
    if (failed === 0 && ok === 0) addToast(`同じ内容の報告書が提出済みのため、${skipped}件とも送っていません`, 'info');
    else if (failed === 0) addToast(`${ok}件を登録しました${skippedNote}`, 'success');
    else addToast(`${ok}件を登録し、${failed}件は失敗しました${skippedNote}（失敗した行は直して再送できます）`, 'warning');
  };

  /** 自己改善: 読み取った建物名・点検種別・書類の種類と、人が確定した値を記録する（次から同じ読みに当てる） */
  const correctionsFor = (sent: UploadRow[]): CorrectionRecord[] => {
    const records: (CorrectionRecord | null)[] = [];
    for (const row of sent) {
      const o = ocr[row.sourceId];
      const input = effStates[row.key]?.input;
      if (o?.state !== 'done' || !input) continue;
      const pages = row.segment ? o.suggestion.pages.filter((p) => p.page - 1 >= row.segment!.start && p.page - 1 <= row.segment!.end) : o.suggestion.pages;
      for (const p of pages) {
        records.push(correctionRecord('property', p.buildingRead, p.property?.code ?? null, input.propertyCode));
        if (input.category === 'report') records.push(correctionRecord('inspection_type', p.inspectionTypeRead, p.inspectionType, input.inspectionType));
      }
      if (input.category && input.category !== 'report') records.push(correctionRecord('category', o.suggestion.documentType, o.suggestion.category, input.category));
    }
    return records.filter((r): r is CorrectionRecord => !!r);
  };

  // ---- 登録済みの報告書 ----
  const registered = useMemo(() => {
    if (preset.kind !== 'report' && preset.kind !== 'edit') return null;
    const inspectionId = presetInspection?.inspection_id ?? (preset.kind === 'edit' ? preset.report.property_inspection_id : null);
    if (!data.loaded && !data.error) return null;
    const list = inspectionId
      ? allReports
          .filter(
            (r) =>
              r.property_inspection_id === inspectionId &&
              LIVE_STATUSES.includes(r.status) &&
              // 点検月の無い点検行は月をまたいで並べる
              (!presetMonth || r.target_month === presetMonth),
          )
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
      : [];
    if (preset.kind === 'edit' && !list.some((r) => r.id === preset.report.id)) list.unshift(overrides[preset.report.id] ?? preset.report);
    return list;
  }, [preset, presetInspection, presetMonth, allReports, data.loaded, data.error, overrides]);
  const previewReport = previewReportId ? (allReports.find((r) => r.id === previewReportId) ?? null) : null;
  const viewer = useMemo(() => ({ isAdmin, isManagement, vendorId: myVendorId ?? null }), [isAdmin, isManagement, myVendorId]);
  const registeredHeading = (() => {
    const insp = presetInspection;
    const r = preset.kind === 'edit' ? preset.report : null;
    const name = insp ? `${insp.property_name}・${insp.inspection_type_label ?? ''}` : r ? `${r.property_name}・${r.inspection_type_label}` : '';
    return `${name}${presetMonth ? `・${formatMonth(presetMonth)}分` : ''}`;
  })();

  const deleteReport = async (target: DbInspectionReport) => {
    setDeletingBusy(true);
    try {
      const updated = await updateInspectionReport(target.id, 'delete');
      setOverrides((prev) => ({ ...prev, [updated.id]: updated }));
      if (previewReportId === target.id) setPreviewReportId(null);
      addToast('報告書を削除しました', 'success');
      onChanged?.();
    } catch (err) {
      addToast(`報告書の削除に失敗しました: ${entryErrorReason(err)}`, 'error');
    } finally {
      setDeletingBusy(false);
    }
  };

  const dirty = sources.length > 0 && !allDone;
  const title = `ファイルアップロード（${presetLabel(preset)}）`;

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      className="max-w-[min(98vw,1800px)]"
      dirty={dirty && !submitting}
      // 送信の途中で閉じると、残りの行の送信が裏で続き、行ごとの結果が見えなくなる
      busy={submitting}
      footer={
        <>
          {reviewCount > 0 && !submitting && <span className="mr-auto text-xs text-red-700">要確認 {reviewCount}行</span>}
          <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
            {allDone ? '閉じる' : 'キャンセル'}
          </Button>
          {!allDone && (
            <Button size="sm" onClick={() => void handleSubmit()} disabled={submitting || pendingRows.length === 0}>
              {submitting ? '送信中…' : pendingRows.length > 0 ? `${pendingRows.length}行を登録する` : '登録する'}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-1.5 text-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <p className="text-xs text-gray-600">
            報告書・見積書・請求書・契約書などを建物ごとに保管します。区分が報告書の行は点検（物件・点検種別・対象月）の報告書として、
            それ以外は物件のファイルとして登録します。見られるのは、物件の管理会社・管理者・アップロードした会社です。
          </p>
          <div className="ml-auto">
            <AiOcrControls
              enabled={useAi}
              onToggle={(checked) => {
                setUseAi(checked);
                if (checked) runOcrAll(true);
              }}
              configured={ai.configured}
              checking={ai.checking}
              message={ai.message}
              onReadLocal={sources.some((s) => s.kind === 'pdf') ? () => runOcrAll(false) : undefined}
              disabled={submitting}
              ocr={ocrSummary}
            />
          </div>
        </div>
        {preset.kind === 'report' && preset.previous?.status === 'returned' && preset.previous.review_comment && (
          <p className="whitespace-pre-line rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-800">
            差戻し理由: {preset.previous.review_comment}
          </p>
        )}
        {(preset.kind === 'report' || preset.kind === 'edit') && (
          <RegisteredReportsPanel
            heading={registeredHeading}
            reports={registered}
            viewer={viewer}
            previewId={previewReportId}
            onPreview={(r) => setPreviewReportId(r.id)}
            initialEditId={preset.kind === 'edit' ? preset.report.id : null}
            onDelete={setDeleting}
            onSaved={(saved) => {
              setOverrides((prev) => ({ ...prev, [saved.id]: saved }));
              onChanged?.();
            }}
            disabled={submitting || deletingBusy}
          />
        )}
        {data.error && (
          <p role="alert" className="text-xs text-red-600">
            点検の一覧を読み込めませんでした（{data.error}）。報告書の行は点検を決められません。
          </p>
        )}
        {fileError && (
          <p role="alert" className="text-xs text-red-600">
            {fileError}
          </p>
        )}

        <div
          className={cn(
            'grid min-h-0 grid-cols-1 gap-2 lg:grid-cols-[minmax(0,4fr)_minmax(0,9fr)]',
            // 登録済みの報告書の一覧を出すときは、その分だけ低くして画面に収める
            preset.kind === 'report' || preset.kind === 'edit' ? 'lg:h-[56vh]' : 'lg:h-[68vh]',
          )}
        >
          {/* 左: プレビュー（区間分け・空白ページの削除・ファイルを追加） */}
          <div
            className={cn('flex min-h-0 flex-col gap-1', dragging && 'rounded ring-2 ring-blue-400')}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void addFiles(e.dataTransfer.files);
            }}
          >
            {previewReport ? (
              <div className="flex min-h-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate font-medium text-gray-700">登録済みのファイル: {previewReport.file_name}</span>
                  <Button variant="ghost" size="sm" className="h-5 px-1 text-[11px]" onClick={() => setPreviewReportId(null)}>
                    {sources.length > 0 ? '追加したファイルのプレビューに戻る' : '閉じる'}
                  </Button>
                </div>
                <StoredReportPreview report={previewReport} />
              </div>
            ) : (
              <UploadPagesPane
                sources={sources}
                docs={docs}
                rotations={rotations}
                rows={rows}
                lockedSources={lockedSources}
                activeRowKey={activeRowKey}
                scanning={scanning}
                disabled={submitting}
                onToggleBreak={toggleBreak}
                onRotate={rotate}
                onToggleRemoved={toggleRemoved}
                onFindBlank={(id) => void findBlankPages(id)}
                onRemoveSource={removeSource}
              />
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={PROPERTY_FILE_ACCEPT}
                className="hidden"
                data-testid="upload-file-input"
                onChange={(e) => {
                  void addFiles(e.target.files ? [...e.target.files] : null);
                  e.target.value = '';
                }}
              />
              <Button variant="secondary" size="sm" className="text-xs" onClick={() => fileInputRef.current?.click()} disabled={submitting}>
                ファイルを追加
              </Button>
              <span className="text-[11px] text-gray-500">
                PDF・画像（JPG/PNG）・Excel・Word・PowerPoint・動画（MP4/MOV）、1ファイル 50MB まで（ここへドラッグしても追加できます）
              </span>
              {opening > 0 && (
                <span className="flex items-center gap-1 text-gray-600" role="status">
                  <Spinner size="sm" />
                  開いています…
                </span>
              )}
            </div>
          </div>

          {/* 右: 1区間1行の表と、選択行の一括設定 */}
          <div className="flex min-h-0 flex-col gap-1">
            <div className="min-h-[10rem] flex-1 overflow-auto rounded border border-gray-200">
              <UploadRowsTable
                rows={rows}
                sources={sourceMap}
                states={effStates}
                checks={checks}
                results={results}
                existingCounts={existingCounts}
                derivedNames={derivedNames}
                sizes={sizes}
                selected={selected}
                activeRowKey={activeRowKey}
                touched={touched}
                disabled={submitting}
                today={today}
                options={options}
                onToggle={(key) =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  })
                }
                onToggleAll={(checked) => setSelected(checked ? new Set(rows.map((r) => r.key)) : new Set())}
                onActivate={(key) => {
                  setActiveRowKey(key);
                  if (previewReportId) setPreviewReportId(null);
                }}
                onChange={changeRow}
                onTakeConflict={takeConflict}
              />
            </div>
            <UploadBulkEdit
              selectedCount={rows.filter((r) => selected.has(r.key)).length}
              options={options}
              today={today}
              disabled={submitting}
              onApply={applyBulkEdit}
            />
          </div>
        </div>
      </div>
      {/* 中に入れた確認ダイアログの cancel / close は外のモーダルが無視する（components/ui/Modal） */}
      <ConfirmDialog
        open={!!confirmReplace}
        onClose={() => setConfirmReplace(null)}
        onConfirm={() => {
          if (confirmReplace) void send(confirmReplace.latest, confirmReplace.prepared);
        }}
        title="提出済みの報告書があります"
        message={`${confirmReplace?.count ?? 0}行は、同じ点検・対象月に提出済みの報告書があります。\n登録すると報告書が追加されます（前の版はそのまま残ります。同じ内容の行は数えていません。送りません）。\nこのまま登録しますか？`}
        confirmLabel="追加で登録する"
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) void deleteReport(deleting);
        }}
        title="報告書の削除"
        message={`「${deleting?.file_name ?? ''}」を削除しますか？\n点検報告書の画面の「削除済みも表示」に残ります（復元は管理者が行います）。`}
        confirmLabel="削除"
        variant="danger"
      />
    </Modal>
  );
}

