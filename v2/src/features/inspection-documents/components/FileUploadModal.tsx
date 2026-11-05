import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
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
  documentTypeIsRead,
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
  assignRowNames,
  buildRows,
  checkRow,
  dropAiValues,
  isBlankPixels,
  liveReportsOf,
  mergeAuto,
  reviewReasons,
  rowKey,
  rowTargetMonth,
  setFields,
  sourceKindOf,
  type BulkPatch,
  type ReviewReason,
  type RowCheck,
  type RowField,
  type RowInput,
  type RowState,
  type UploadRow,
  type UploadSource,
} from '../lib/uploadRows';
import { clampLeftWidth, submitGate } from '../lib/uploadView';
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

/** 左右の幅を覚える localStorage の鍵（修正依頼1104 E9） */
const LEFT_WIDTH_KEY = 'signage.fileUpload.leftWidth';

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
  // 実施日: 報告書UP は行の点検開始日（無ければ前の版の実施日）、編集はその報告書の実施日
  const performedOn = preset.kind === 'report' ? preset.defaultPerformedOn || preset.previous?.performed_on || '' : (report?.performed_on ?? '');
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
  /** 空白ページを探した結果（ファイルごと。ボタンの横に残す。トーストは上に出て数秒で消え、見落とされた） */
  const [blankNotes, setBlankNotes] = useState<Record<string, string>>({});

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
  const [confirmReplace, setConfirmReplace] = useState<{
    count: number;
    latest: DbInspectionReport[];
    prepared: Map<string, Prepared>;
    targets: UploadRow[];
  } | null>(null);
  /** 要確認（食い違いだけ）の行をこのまま登録するかの確認（修正依頼1104 E1） */
  const [confirmReview, setConfirmReview] = useState<{ count: number; targets: UploadRow[] } | null>(null);
  /** 登録で止めたときの知らせ（登録ボタンの近くに残す。上のお知らせは数秒で消える。修正依頼1104 E1） */
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** AI-OCR の生の結果を保存したファイル（同じファイルを区間に分けても最初の行にだけ持たせる。2回に分けて登録しても同じ） */
  const ocrSavedRef = useRef(new Set<string>());

  // ---- 読み取り ----
  /**
   * 取込の方式（修正依頼1104 E11）。既定は『ファイル名を取込』（ファイル名と PDF の文字情報。費用なし）、『AIで取込』は AI-OCR も使う。
   * AI からファイル名に戻すと AI の結果は値から外す（結果は残しておき、AI に戻しても呼び直さない）
   */
  const [useAi, setUseAi] = useState(false);
  // 読み取りの途中（前の描画で作った関数の中）から、今の方式を見る
  const useAiRef = useRef(false);
  const [ocr, setOcr] = useState<Record<string, OcrState>>({});
  /** 最後に読んだ生の結果と、それが AI-OCR のものか（ファイル名を取込のときは AI の結果を保存しない） */
  const ocrRawRef = useRef(new Map<string, { raw: unknown; ai: boolean }>());
  /** AI-OCR で読んだ結果（ファイルごと。AI に戻したときに呼び直さず使う） */
  const aiCacheRef = useRef(new Map<string, { suggestion: OcrSuggestion; raw: unknown; mode: Extract<OcrState, { state: 'done' }>['mode']; pages: number }>());

  // ---- 登録済みの報告書（報告書UP・再提出・編集） ----
  const [overrides, setOverrides] = useState<Record<string, DbInspectionReport>>({});
  const [previewReportId, setPreviewReportId] = useState<string | null>(
    preset.kind === 'edit' ? preset.report.id : preset.kind === 'report' ? (preset.previous?.id ?? null) : null,
  );
  const [deleting, setDeleting] = useState<DbInspectionReport | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [editDirty, setEditDirty] = useState(false);

  // 閉じたら pdfjs の文書を片付ける。読み取りの結果は非同期で届くので、届いた時点のファイル・既定を ref で見る
  const docsRef = useRef(docs);
  const sourcesRef = useRef(sources);
  const baseStatesRef = useRef(baseStates);
  useEffect(() => {
    docsRef.current = docs;
    sourcesRef.current = sources;
    baseStatesRef.current = baseStates;
  }, [docs, sources, baseStates]);
  // 閉じた後に届いた非同期の結果（空白ページの検出など）を捨てるための印
  const closedRef = useRef(false);
  useEffect(() => {
    closedRef.current = false;
    return () => {
      closedRef.current = true;
      Object.values(docsRef.current).forEach((d) => d.destroy());
    };
  }, []);

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
    // 管理会社は略称で見せ（無ければ正式名）、正式名でも探せるようにする（修正依頼1104 E4。詳細は正式名＝fullName）
    const mgmt = new Map<string, { name: string; hint?: string; fullName?: string }>();
    for (const m of hints.managementCompanies) {
      const short = m.shortName?.trim();
      mgmt.set(m.id, short && short !== m.name ? { name: short, hint: m.name, fullName: m.name } : { name: m.name, fullName: m.name });
    }
    for (const i of data.inspections)
      if (i.management_company_id && !mgmt.has(i.management_company_id))
        mgmt.set(i.management_company_id, { name: i.management_company_name ?? i.management_company_id });
    // 保守会社は一覧（点検の vendor_name。多くは業務システムの略称）と同じ表記で出し、正式名・略称は hint にして探せるようにする
    // （修正依頼1029 本番確認(3)。ファイル名の照合は nameCtx の正式名・略称のまま）。管理会社は一覧も正式名なのでそのまま
    const listVendorName = new Map(vendorCandidatesOf(data.inspections).map((v) => [v.id, v.name]));
    const vendors = new Map<string, { name: string; hint?: string }>();
    for (const v of hints.vendors) {
      const label = listVendorName.get(v.id) ?? v.shortName ?? v.name;
      const others = [...new Set([v.name, v.shortName ?? ''])].filter((n) => n && n !== label);
      vendors.set(v.id, { name: label, hint: others.join('／') || undefined });
    }
    for (const [id, name] of listVendorName) if (!vendors.has(id)) vendors.set(id, { name });
    const typesByProperty = new Map<string, Set<string>>();
    const allTypes = new Set<string>();
    for (const i of data.inspections) {
      const l = i.inspection_type_label ?? '';
      if (!l) continue;
      allTypes.add(l);
      typesByProperty.set(i.property_code, (typesByProperty.get(i.property_code) ?? new Set()).add(l));
    }
    const toOptions = (m: Map<string, { name: string; hint?: string; fullName?: string }>) =>
      [...m.entries()]
        .map(([value, v]) => ({ value, label: v.name, hint: v.hint, fullName: v.fullName }))
        .sort((a, b) => a.label.localeCompare(b.label, 'ja'));
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
      // 自社（業務システムの発行元と同じ会社）は保守会社の読み取りの候補に入れない（宛名の「株式会社BARAN 御中」を保守会社と読むため。
      // 修正依頼1104 E1）。自社の保守会社アカウントでは外さない。手で選ぶ候補（options.vendors）には残す
      vendors: (hints.vendors.length ? hints.vendors : vendorCandidatesOf(data.inspections).map((v) => ({ ...v, shortName: null }))).filter(
        (v) => v.id === myVendorId || !hints.ownVendorIds.includes(v.id),
      ),
      managementCompanies: hints.managementCompanies,
      inspectionTypes: [...new Set(data.inspections.map((i) => i.inspection_type_label ?? '').filter(Boolean))],
    }),
    [hints, options.properties, data.inspections, myVendorId],
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

  const { checks, reasons } = useMemo(() => {
    const out: Record<string, RowCheck> = {};
    const why: Record<string, ReviewReason[]> = {};
    for (const r of rows) {
      const source = sourceMap[r.sourceId];
      const size = sizes[r.key] ?? (source && (source.kind !== 'pdf' || r.pages.length === source.pageCount) ? source.file.size : null);
      const st = effStates[r.key] ?? presetState;
      const check = checkRow(r, st, { inspections: data.inspections, source, size, canReport: !isManagement });
      out[r.key] = check;
      // 要確認の理由（ステータスの横に出し、登録の止め方を決める。修正依頼1104 E1）
      why[r.key] = reviewReasons(st, check);
    }
    return { checks: out, reasons: why };
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
  /** 選択した行のうち送る行（修正依頼1104 E10） */
  const selectedPending = pendingRows.filter((r) => selected.has(r.key));

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
  /** 食い違いを今の値のままにする（今の値を手入力として入れ直す。区分の select は同じ値を選び直しても変わらないため。修正依頼1104 E1） */
  const keepConflict = (key: string, field: RowField) => {
    const row = rows.find((r) => r.key === key);
    const st = row ? stateOf(row) : undefined;
    if (row && st?.conflicts[field]) updateRow(key, row.sourceId, (s) => setFields(s, { [field]: s.input[field] }, 'manual'));
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
          inspectionType: extraction.inspectionType ?? undefined,
        },
        'filename',
      );
      // 管理会社は物件から引いたものなら「物件から」、ファイル名の会社名なら「ファイル名」を出どころにする
      if (extraction.managementCompanyId)
        base = mergeAuto(base, { managementCompanyId: extraction.managementCompanyId }, extraction.managementCompanySource ?? 'filename');
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
          void runOcrFor(source, pages, useAiRef.current && ai.configured);
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
        if (useAiRef.current && ai.configured && kind === 'image') void runOcrFor(source, null, true);
      }
    }
  };

  const removeSource = (id: string) => {
    docs[id]?.destroy();
    setDocs((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== id)));
    bytesRef.current.delete(id);
    pdfLibRef.current.delete(id);
    setSources((prev) => prev.filter((s) => s.id !== id));
    clearBlankNote(id);
    setSelected((prev) => new Set([...prev].filter((k) => !k.startsWith(`${id}:`) && k !== id)));
  };

  const updateSource = (id: string, fn: (s: UploadSource) => UploadSource) => setSources((prev) => prev.map((s) => (s.id === id ? fn(s) : s)));
  /** 空白ページを探した結果の文言を消す（ページの削除・区切りを手で変えたら、前の結果は今の状態と合わない） */
  const clearBlankNote = (id: string) =>
    setBlankNotes((prev) => (id in prev ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== id)) : prev));
  const toggleBreak = (id: string, before: number) => {
    clearBlankNote(id);
    updateSource(id, (s) => {
      const breaks = new Set(s.breaks);
      if (breaks.has(before)) breaks.delete(before);
      else breaks.add(before);
      return { ...s, breaks };
    });
    // 区間の組み方が変わるので、前の失敗の表示は消す（別のページの区間に残さない）
    setResults((prev) => Object.fromEntries(Object.entries(prev).filter(([, r]) => r.state === 'ok' || r.state === 'skipped')));
  };
  const toggleRemoved = (id: string, page: number) => {
    clearBlankNote(id);
    updateSource(id, (s) => {
      const removed = new Set(s.removed);
      if (removed.has(page)) removed.delete(page);
      else removed.add(page);
      return { ...s, removed };
    });
  };
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
      // 探している間に外したファイル・閉じた画面には何も言わない
      if (closedRef.current || docsRef.current[id] !== pages) return;
      // 削除の印がもう付いているページは数えない（押し直しで同じページを「削除しました」と言わない）
      const added = blank.filter((p) => !source.removed.has(p));
      if (added.length > 0) updateSource(id, (s) => ({ ...s, removed: new Set([...s.removed, ...added]) }));
      const pageList = (list: number[]) => `p.${list.map((p) => p + 1).join('・')}`;
      const note =
        added.length > 0
          ? `${added.length}ページを削除しました（${pageList(added)}。「戻す」で戻せます）`
          : blank.length > 0
            ? `空白ページはすべて削除の印が付いています（${pageList(blank)}）`
            : '空白ページはありませんでした';
      setBlankNotes((prev) => ({ ...prev, [id]: note }));
      addToast(note, 'info');
    } catch (err) {
      // 閉じたときは pdfjs の文書を片付けるので、探している途中なら失敗する。閉じた後には知らせない
      if (closedRef.current || docsRef.current[id] !== pages) return;
      console.error('Blank page scan failed:', err);
      // 上のお知らせは4秒で消えるので、ファイルの欄にも残す（修正依頼1029 本番確認(4) の検証）
      const note = `空白ページを探せませんでした: ${entryErrorReason(err)}`;
      setBlankNotes((prev) => ({ ...prev, [id]: note }));
      addToast(note, 'error');
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
      if (withAi) aiCacheRef.current.set(source.id, { suggestion, raw: read.raw, mode: read.mode, pages: read.pages });
      // 読んでいる間に『ファイル名を取込』へ戻したときは、AI の結果を値に入れない（結果は残すので、AI に戻せば呼び直さず使う）
      if (withAi && !useAiRef.current) return;
      ocrRawRef.current.set(source.id, { raw: read.raw, ai: withAi });
      setOcr((prev) => ({ ...prev, [source.id]: { state: 'done', suggestion, mode: read.mode, pages: read.pages } }));
      applyOcr(source, suggestion, withAi ? 'ai' : 'text');
    } catch (err) {
      console.error('OCR failed:', err);
      if (withAi && !useAiRef.current) return;
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
      : documentTypeIsRead(suggestion.documentType)
        ? suggestion.category
        : undefined;
    const patchFor = (pages: OcrSuggestion['pages'], whole: boolean): Partial<RowInput> => {
      const property = pages.find((p) => p.property)?.property ?? (whole ? suggestion.property : null);
      return {
        category: docCategory,
        categoryNote: docCategory === 'other' ? suggestion.categoryNote || undefined : undefined,
        propertyCode: property?.code,
        inspectionType: pages.find((p) => p.inspectionType)?.inspectionType ?? suggestion.inspectionType ?? undefined,
        performedOn: pages.find((p) => p.performedOn)?.performedOn ?? suggestion.performedOn ?? undefined,
        targetMonth: suggestion.targetMonth ? suggestion.targetMonth.slice(0, 7) : undefined,
        vendorId: suggestion.vendor?.id,
      };
    };
    /** 読んだ値を入れる。管理会社は読んだ物件から引くので、出どころは「物件から」にする */
    const merge = (state: RowState, patch: Partial<RowInput>) => {
      const mgmt = patch.propertyCode ? propertyAliasOf.get(patch.propertyCode)?.managementCompanyId : undefined;
      const next = mergeAuto(state, patch, src);
      return mgmt ? mergeAuto(next, { managementCompanyId: mgmt }, 'property') : next;
    };
    const docPatch = patchFor(suggestion.pages, true);
    const base = merge(baseStatesRef.current[id] ?? presetState, docPatch);
    setBaseStates((prev) => ({ ...prev, [id]: merge(prev[id] ?? presetState, docPatch) }));
    let breaks = source.breaks;
    // 建物が変わるページで区切る案は報告書のファイルだけ（見積書などを黙って分けない）
    const isReportFile = docCategory === 'report' || base.input.category === 'report';
    if (source.kind === 'pdf' && isReportFile && breaks.size === 0 && !lockedSources.has(id)) {
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
        next[key] = merge(next[key] ?? base, patchFor(pages, segs.length === 1));
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
  /**
   * 取込の方式を切り替える（修正依頼1104 E11）。AI へ: 読み終えたファイルは呼び直さず前の結果を入れ、まだのファイルだけ AI-OCR に送る。
   * ファイル名へ: AI で入れた値と AI の食い違いを外し、PDF は文字情報で読み直す（無料。AI が先に埋めていた欄を文字情報で埋め直す）
   */
  const changeReadMode = (toAi: boolean) => {
    if (toAi === useAiRef.current) return;
    setUseAi(toAi);
    useAiRef.current = toAi;
    if (toAi) {
      for (const s of sources) {
        if (lockedSources.has(s.id)) continue;
        const cached = aiCacheRef.current.get(s.id);
        if (cached) {
          ocrRawRef.current.set(s.id, { raw: cached.raw, ai: true });
          setOcr((prev) => ({ ...prev, [s.id]: { state: 'done', suggestion: cached.suggestion, mode: cached.mode, pages: cached.pages } }));
          applyOcr(s, cached.suggestion, 'ai');
        } else void runOcrFor(s, docs[s.id] ?? null, true);
      }
      return;
    }
    const strip = (prev: Record<string, RowState>) => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, dropAiValues(v)]));
    setStates(strip);
    setBaseStates(strip);
    for (const s of sources) {
      if (lockedSources.has(s.id)) continue;
      if (ocrRawRef.current.get(s.id)?.ai) ocrRawRef.current.delete(s.id);
      if (s.kind === 'pdf') void runOcrFor(s, docs[s.id] ?? null, false);
      else setOcr((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== s.id)));
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

  const stop = (text: string) => {
    setSubmitError(text);
    addToast(text, 'error');
  };

  /**
   * targets を登録する（全部の行、または選択した行。修正依頼1104 E10）。入力漏れ（区分・物件が無い・報告書の点検が決まらない・
   * 50MB 超など）の行があれば止める。食い違いの要確認だけの行は、確認のうえそのまま登録する（修正依頼1104 E1。業務システムの Q1 の決定と同じ）
   */
  const handleSubmit = (targets: UploadRow[]) => {
    setTouched(true);
    setSubmitError(null);
    if (targets.length === 0) {
      stop(pendingRows.length === 0 ? '登録する行がありません（ファイルを追加してください）' : '登録する行を選んでください');
      return;
    }
    const gate = submitGate(
      targets.map((r) => r.key),
      reasons,
    );
    if (gate.blocking.length > 0) {
      const nos = targets.filter((r) => gate.blocking.includes(r.key)).map((r) => r.no);
      stop(`入力の足りない行が${nos.length}行あります（行${nos.join('・')}。赤い欄・詳細の理由を直してください）`);
      return;
    }
    if (gate.confirmable.length > 0) {
      setConfirmReview({ count: gate.confirmable.length, targets });
      return;
    }
    void prepareAndSend(targets);
  };

  const prepareAndSend = async (targets: UploadRow[]) => {
    setSubmitting(true);
    let latest: DbInspectionReport[] = allReports;
    const hasReport = targets.some((r) => effStates[r.key]?.input.category === 'report');
    try {
      // 提出済みの版と同じ内容かを見比べるので、送る直前の報告書の一覧で数える（開いた後にほかの人が出した版も入れる）
      if (hasReport) latest = await fetchInspectionReports();
    } catch (err) {
      setSubmitting(false);
      stop(`登録前の確認に失敗しました: ${entryErrorReason(err)}`);
      return;
    }
    const prepared = new Map<string, Prepared>();
    for (const r of targets) {
      try {
        prepared.set(r.key, await prepare(r));
      } catch (err) {
        // 切り出せなかった区間は送信のときにもう一度試し、失敗を行の結果に出す
        console.error('Prepare failed:', err);
      }
    }
    setSubmitting(false);
    // 同じ点検・対象月に報告書があれば追加になる（同じ内容で送らない区間は数えない）
    const replacing = targets.filter((r) => {
      const st = effStates[r.key];
      const insp = checks[r.key]?.inspection;
      if (!st || st.input.category !== 'report' || !insp) return false;
      const month = rowTargetMonth(st.input);
      const hash = prepared.get(r.key)?.hash;
      if (hash && identicalLiveReport(latest, insp.inspection_id, month, hash)) return false;
      return liveReportsOf(latest, insp.inspection_id, month).length > 0;
    }).length;
    if (replacing > 0) {
      setConfirmReplace({ count: replacing, latest, prepared, targets });
      return;
    }
    await send(targets, latest, prepared);
  };

  const send = async (targets: UploadRow[], latest: DbInspectionReport[], prepared: Map<string, Prepared>) => {
    setSubmitting(true);
    setSubmitError(null);
    let ok = 0;
    let skipped = 0;
    let failed = 0;
    const okRows: UploadRow[] = [];
    // その他ファイルの名前（同じ「日付_建物_区分」になる行に _1・_2… を付ける）。連番は送らない行を除く全部の行（登録済みも含む）で振り、
    // 登録済みの行は保存した名前に固定して、未登録の行はその名前と重ならない番号にする（選択した行だけを2回に分けて登録しても
    // 同じ名前にしない。修正依頼1104 E10）
    const propertyName = (code: string) => options.properties.find((o) => o.value === code)?.label ?? '';
    const categoryLabelOf = (input: RowInput) =>
      propertyFileCategoryLabel({ category: input.category as Exclude<UploadCategory, 'report'>, category_note: input.category === 'other' ? input.categoryNote.trim() : null });
    const fileNameOf = (input: RowInput, fileName: string, index: number, total: number) =>
      buildPropertyFileName({
        docDate: input.performedOn,
        propertyName: propertyName(input.propertyCode),
        categoryLabel: categoryLabelOf(input),
        originalName: fileName,
        index,
        total,
      });
    const otherRows = rows.filter((r) => {
      const c = effStates[r.key]?.input.category;
      return c && c !== 'report' && !checks[r.key]?.skip;
    });
    // 送らない未登録の行（今回選ばなかった行）も、次に送るときと同じ番号になるよう母集団に入れる
    const names = assignRowNames(
      otherRows.map((r) => {
        const input = effStates[r.key]!.input;
        const res = results[r.key];
        return { key: r.key, base: `${input.performedOn}|${input.propertyCode}|${categoryLabelOf(input)}`, saved: res?.state === 'ok' ? res.fileName : null };
      }),
      (key, index, total) => {
        const r = otherRows.find((x) => x.key === key)!;
        const name = prepared.get(key)?.file.name ?? sourceMap[r.sourceId]?.file.name ?? '';
        return fileNameOf(effStates[key]!.input, name, index, total);
      },
    );
    for (const row of targets) {
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
          const category = input.category as Exclude<UploadCategory, 'report' | ''>;
          const saved = await registerPropertyFile({
            propertyCode: input.propertyCode,
            category,
            categoryNote: category === 'other' ? input.categoryNote.trim() : null,
            // 作業実施日があれば「作業実施日_建物名_区分」に付け替える（修正依頼1026 J4）
            fileName: names[row.key] ?? fileNameOf(input, pre.file.name, 0, 1),
            file: pre.file,
            docDate: input.performedOn || null,
            note: input.note.trim() || null,
            // AI-OCR の生の結果は、同じファイルを区間に分けても最初の行にだけ持たせる（旧 OtherFileUploadModal と同じ。2回に分けて登録しても）。
            // 『ファイル名を取込』のときは AI の結果を値に使っていないので保存しない（修正依頼1104 E11）
            ocrResult: ocrSavedRef.current.has(row.sourceId) ? null : ocrRawOf(row.sourceId),
            // 保守会社は管理者が選んだものだけ渡す（DB は保守会社のアカウントを自社に、管理会社を無しに固定する）
            vendorId: isAdmin ? input.vendorId || null : null,
          });
          ocrSavedRef.current.add(row.sourceId);
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
    if (failed > 0) setSubmitError(`${failed}件の登録に失敗しました（行の「失敗」と詳細の理由を見て、直して再送できます）`);
    if (failed === 0 && ok === 0) addToast(`同じ内容の報告書が提出済みのため、${skipped}件とも送っていません`, 'info');
    else if (failed === 0) addToast(`${ok}件を登録しました${skippedNote}`, 'success');
    else addToast(`${ok}件を登録し、${failed}件は失敗しました${skippedNote}（失敗した行は直して再送できます）`, 'warning');
  };

  /** 保存する読み取りの生の結果（AI の結果は『AIで取込』のときだけ） */
  const ocrRawOf = (sourceId: string): unknown => {
    const r = ocrRawRef.current.get(sourceId);
    return r && (!r.ai || useAiRef.current) ? r.raw : null;
  };

  /** 自己改善: 読み取った建物名・点検種別・書類の種類と、人が確定した値を記録する（次から同じ読みに当てる） */
  const correctionsFor = (sent: UploadRow[]): CorrectionRecord[] => {
    const records: (CorrectionRecord | null)[] = [];
    for (const row of sent) {
      const o = ocr[row.sourceId];
      const input = effStates[row.key]?.input;
      if (o?.state !== 'done' || !input) continue;
      // ファイル名を取込のときは AI の読みを値に使っていないので記録しない（修正依頼1104 E11）
      if (o.mode !== 'local' && !useAiRef.current) continue;
      const pages = row.segment ? o.suggestion.pages.filter((p) => p.page - 1 >= row.segment!.start && p.page - 1 <= row.segment!.end) : o.suggestion.pages;
      for (const p of pages) {
        records.push(correctionRecord('property', p.buildingRead, p.property?.code ?? null, input.propertyCode));
        if (input.category === 'report') records.push(correctionRecord('inspection_type', p.inspectionTypeRead, p.inspectionType, input.inspectionType));
      }
      // 区分は書類の種類が読めたときだけ記録する（空・「その他」は区分の手掛かりにならない。documentTypeIsRead）
      if (input.category && input.category !== 'report' && documentTypeIsRead(o.suggestion.documentType))
        records.push(correctionRecord('category', o.suggestion.documentType, o.suggestion.category, input.category));
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

  // ---- 一括設定のポップアップ（値は UploadBulkEdit を閉じても消さない。修正依頼1104 E7） ----
  const [bulkOpen, setBulkOpen] = useState(false);
  const selectedEditable = rows.filter((r) => selected.has(r.key) && !isRowFinished(results[r.key])).length;

  // ---- 左右の幅（修正依頼1104 E9。null は既定の比。ブラウザに覚える） ----
  const gridRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState<number | null>(() => {
    try {
      const v = Number(window.localStorage.getItem(LEFT_WIDTH_KEY));
      return Number.isFinite(v) && v > 0 ? v : null;
    } catch {
      return null;
    }
  });
  const changeLeftWidth = (px: number | null) => {
    setLeftWidth(px);
    try {
      if (px === null) window.localStorage.removeItem(LEFT_WIDTH_KEY);
      else window.localStorage.setItem(LEFT_WIDTH_KEY, String(px));
    } catch {
      // 覚えられなくても幅は変えられる（プライベートウィンドウなど）
    }
  };

  // 入れたファイルが残っているか、登録済みの報告書の編集欄に入れかけの値があれば、閉じる前に確認する
  const dirty = (sources.length > 0 && !allDone) || editDirty;
  const title = `ファイルアップロード（${presetLabel(preset)}）`;

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      // 常に全画面（修正依頼1104 E3。表示する内容が多いため）。右上は赤い文字の「閉じる」（E2。この画面だけ）
      fullScreen
      closeLabel="閉じる"
      dirty={dirty && !submitting}
      dirtyMessage="入力した内容は破棄されます。閉じますか？"
      // 送信の途中で閉じると、残りの行の送信が裏で続き、行ごとの結果が見えなくなる
      busy={submitting}
      footer={({ requestClose }) => (
        <>
          <span className="mr-auto flex min-w-0 flex-wrap items-center gap-x-2 text-xs">
            {reviewCount > 0 && !submitting && <span className="text-red-700">要確認 {reviewCount}行</span>}
            {submitError && !submitting && (
              <span role="alert" className="rounded bg-red-50 px-1.5 py-0.5 text-red-700" data-testid="upload-submit-error">
                {submitError}
              </span>
            )}
          </span>
          {/* キャンセルも × と同じく、入れたファイルが残っていれば破棄の確認を出す（修正依頼1029 本番確認(2)） */}
          <Button variant="secondary" size="sm" onClick={requestClose} disabled={submitting}>
            {allDone ? '閉じる' : 'キャンセル'}
          </Button>
          {!allDone && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleSubmit(selectedPending)}
                disabled={submitting || selectedPending.length === 0}
                title="☑ で選んだ行だけを登録します"
              >
                選択した {selectedPending.length} 行を登録
              </Button>
              <Button size="sm" onClick={() => handleSubmit(pendingRows)} disabled={submitting || pendingRows.length === 0}>
                {submitting ? '送信中…' : pendingRows.length > 0 ? `${pendingRows.length}行を登録する` : '登録する'}
              </Button>
            </>
          )}
        </>
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 text-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <p className="text-xs text-gray-600">
            報告書・見積書・請求書・契約書などを建物ごとに保管します。区分が報告書の行は点検（物件・点検種別・対象月）の報告書として、
            それ以外は物件のファイルとして登録します。見られるのは、物件の管理会社・管理者・アップロードした会社です。
          </p>
          <div className="ml-auto">
            <AiOcrControls
              enabled={useAi}
              onToggle={changeReadMode}
              configured={ai.configured}
              checking={ai.checking}
              message={ai.message}
              onReadLocal={!useAi && sources.some((s) => s.kind === 'pdf') ? () => runOcrAll(false) : undefined}
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
            onEditDirtyChange={setEditDirty}
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

        {/*
          全画面（修正依頼1104 E3）の残りの高さいっぱいに、左のプレビュー・幅を変えるバー・右の表を並べる（登録済みの報告書の一覧があれば、
          その下の残り）。既定の幅は今までの比（1366 幅では左 1：右 3、1536 以上は 4：9。左は 22.5rem を下回らせない＝プレビューを
          1行に2枚並べられる幅。縦のスクロールバーが 17px の環境でも 2枚）。バーを動かした後は左の幅を px で持ち、右は 20rem まで
          狭められる（表は横スクロールで見る。修正依頼1104 E9）。lg 未満は縦に積み、バーは出さない
        */}
        <div
          ref={gridRef}
          className={cn(
            'grid min-h-0 grid-cols-1 gap-1 lg:min-h-[24rem] lg:flex-1',
            leftWidth === null
              ? 'lg:grid-cols-[minmax(22.5rem,1fr)_auto_minmax(0,3fr)] 2xl:grid-cols-[minmax(0,4fr)_auto_minmax(0,9fr)]'
              : 'lg:grid-cols-[var(--upload-left)_auto_minmax(20rem,1fr)]',
          )}
          style={leftWidth === null ? undefined : ({ '--upload-left': `${leftWidth}px` } as CSSProperties)}
        >
          {/* 左: プレビュー（区間分け・空白ページの削除・ファイルを追加） */}
          <div
            ref={leftRef}
            className={cn('flex min-h-0 min-w-0 flex-col gap-1', dragging && 'rounded ring-2 ring-blue-400')}
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
                blankNotes={blankNotes}
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

          <ResizeBar gridRef={gridRef} leftRef={leftRef} width={leftWidth} onChange={changeLeftWidth} />

          {/* 右: 選択行の一括設定（ボタンで開くポップアップ。修正依頼1104 E7）と、1区間1行の表 */}
          <div className="flex min-h-0 min-w-0 flex-col gap-1">
            {/* @container: 右の列が一括設定のポップアップ（26rem）より狭いときは、ポップアップを右端に揃えて画面の外へ出さない（UploadBulkEdit） */}
            <div className="@container relative flex items-center gap-2 text-xs">
              <Button
                variant="secondary"
                size="sm"
                className="h-6 border-emerald-500 text-[11px] text-emerald-800"
                aria-expanded={bulkOpen && selectedEditable > 0}
                aria-controls="upload-bulk-edit"
                disabled={submitting || selectedEditable === 0}
                title={selectedEditable === 0 ? '☑ で行を選ぶと押せます' : undefined}
                onClick={() => setBulkOpen((v) => !v)}
                data-testid="upload-bulk-open"
              >
                選択行に一括設定（{selectedEditable}行）
              </Button>
              <span className="text-[11px] text-gray-500">☑ で選んだ行に、同じ値をまとめて入れます</span>
              <UploadBulkEdit
                open={bulkOpen && selectedEditable > 0}
                onClose={() => setBulkOpen(false)}
                selectedCount={selectedEditable}
                options={options}
                today={today}
                disabled={submitting}
                onApply={(patch) => {
                  applyBulkEdit(patch);
                  setBulkOpen(false);
                }}
              />
            </div>
            <div className="min-h-[10rem] flex-1 overflow-auto rounded border border-gray-200">
              <UploadRowsTable
                rows={rows}
                sources={sourceMap}
                states={effStates}
                checks={checks}
                reasons={reasons}
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
                fixedOtherVendorId={isAdmin ? undefined : isManagement ? '' : (myVendorId ?? '')}
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
                onKeepConflict={keepConflict}
              />
            </div>
          </div>
        </div>
      </div>
      {/* 中に入れた確認ダイアログの cancel / close は外のモーダルが無視する（components/ui/Modal） */}
      <ConfirmDialog
        open={!!confirmReplace}
        onClose={() => setConfirmReplace(null)}
        onConfirm={() => {
          if (confirmReplace) void send(confirmReplace.targets, confirmReplace.latest, confirmReplace.prepared);
        }}
        title="提出済みの報告書があります"
        message={`${confirmReplace?.count ?? 0}行は、同じ点検・対象月に提出済みの報告書があります。\n登録すると報告書が追加されます（前の版はそのまま残ります。同じ内容の行は数えていません。送りません）。\nこのまま登録しますか？`}
        confirmLabel="追加で登録する"
      />
      <ConfirmDialog
        open={!!confirmReview}
        onClose={() => setConfirmReview(null)}
        onConfirm={() => {
          if (confirmReview) void prepareAndSend(confirmReview.targets);
        }}
        title="要確認の行があります"
        message={`要確認 ${confirmReview?.count ?? 0} 行をこのまま登録しますか？\n（読み取った値と入っている値の食い違いが残っています。今の値で登録します。直すときは「戻る」を押し、詳細の「…にする」「今の値のままにする」を使ってください）`}
        confirmLabel="このまま登録する"
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

/**
 * 左（プレビュー）と右（表）の間の縦のバー（修正依頼1104 E9。業務システムと同じ）。ドラッグか、フォーカスして ← → で動かす
 * （Shift で大きく、Home・End で端まで）。ダブルクリックで既定の幅に戻す。lg 未満（縦に積むとき）は出さない
 */
function ResizeBar({
  gridRef,
  leftRef,
  width,
  onChange,
}: {
  gridRef: RefObject<HTMLDivElement | null>;
  leftRef: RefObject<HTMLDivElement | null>;
  width: number | null;
  onChange: (px: number | null) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startLeft: number } | null>(null);
  /** 2列とバー・すき間を合わせた幅と、バーとすき間の幅 */
  const measure = () => {
    const grid = gridRef.current?.getBoundingClientRect().width ?? 0;
    const bar = barRef.current?.getBoundingClientRect().width ?? 0;
    const gap = gridRef.current ? parseFloat(getComputedStyle(gridRef.current).columnGap) || 0 : 0;
    return { grid, chrome: bar + gap * 2 };
  };
  const currentLeft = () => width ?? leftRef.current?.getBoundingClientRect().width ?? 360;
  const set = (px: number) => {
    const { grid, chrome } = measure();
    onChange(clampLeftWidth(px, grid, chrome));
  };
  // 窓を狭めて右が最小より狭くなったら、左を縮めて収める
  useEffect(() => {
    if (width === null) return;
    const fit = () => {
      const { grid, chrome } = measure();
      if (grid <= 0 || !barRef.current?.offsetParent) return;
      const clamped = clampLeftWidth(width, grid, chrome);
      if (clamped !== width) onChange(clamped);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measure は ref だけを読む
  }, [width, onChange]);
  return (
    <div
      ref={barRef}
      role="separator"
      aria-orientation="vertical"
      aria-label="プレビューと表の幅を変える"
      aria-valuenow={width ?? undefined}
      tabIndex={0}
      title="ドラッグ（または ← →）でプレビューの幅を変えます。ダブルクリックで元の幅に戻します"
      data-testid="upload-resize-bar"
      className="group hidden w-2 cursor-col-resize touch-none items-stretch justify-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 lg:flex"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = { startX: e.clientX, startLeft: currentLeft() };
      }}
      onPointerMove={(e) => {
        const d = dragRef.current;
        if (d) set(d.startLeft + e.clientX - d.startX);
      }}
      onPointerUp={(e) => {
        dragRef.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
      onDoubleClick={() => onChange(null)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 64 : 16;
        if (e.key === 'ArrowLeft') set(currentLeft() - step);
        else if (e.key === 'ArrowRight') set(currentLeft() + step);
        else if (e.key === 'Home') set(0);
        else if (e.key === 'End') set(Number.MAX_SAFE_INTEGER);
        else return;
        e.preventDefault();
      }}
    >
      <span className="w-1 rounded bg-gray-300 group-hover:bg-blue-400 group-focus-visible:bg-blue-500" />
    </div>
  );
}
