// signage-ai-ocr - 報告書・その他ファイルの AI-OCR（修正依頼1025 G2・G4）。Claude Haiku（claude-haiku-5-5）で読む。
//
// 認証は signage-admin-users と同じ形: Authorization の JWT を getUser で確かめ、signage_profiles で有効なアカウント
// （管理者・保守会社・管理会社）だけ通す。読んだ結果の後処理（日付・建物名・会社名・点検種別の照合と辞書）は画面側
// （v2/src/features/inspection-documents/lib/aiOcr.ts）が行う。ここは読むだけで、DB の値は返さない。
//
// 流れ（invoice-intake に倣う）: 画面がまず PDF の文字情報（テキスト層）を pdfjs で読み、十分なら mode=text で文字だけを送る。
// 足りない（スキャン画像の PDF）なら先頭 MAX_PDF_PAGES ページだけを切り出した PDF を mode=pdf で送る。画像（JPG/PNG）は mode=image。
//
// 費用の守り: ページ数・文字数の上限、1日の呼び出し件数の上限（全体と1人あたり。日本時間の0時で区切る）、再試行は最大1回
// （SDK の maxRetries=1）。上限の確認と枠の予約は、モデルを呼ぶ前に RPC ocr_reserve_usage で原子的に行う（同時に送られても
// 上限を超えて呼ばない。失敗した呼び出しも予約の行が残るので数に入る）。呼んだ後でその行にトークン数と結果を書き、
// signage_audit_logs（監査）にも記録する。
//
// デプロイ（人が行う。scripts/fix-1025-reports.sql を先に適用しておく）:
//   1. supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref pdouwmjyswswfmzpfjzf
//      （任意: AI_OCR_DAILY_LIMIT=200 AI_OCR_DAILY_LIMIT_PER_USER=50 で1日の上限を変えられる）
//   2. supabase functions deploy signage-ai-ocr --project-ref pdouwmjyswswfmzpfjzf --use-api --no-verify-jwt
//      （JWT はゲートウェイではなく下の getUser で検証する）
//   キーが未設定の間は status が configured=false を返し、read は 503 を返す（画面はチェックボックスを無効にする）。

import { createClient } from 'npm:@supabase/supabase-js@2.47.0';
import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0';
import { PDFDocument } from 'npm:pdf-lib@1.17.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MODEL = 'claude-haiku-5-5';
/** スキャン PDF で送るページ数の上限（画面も同じ値で切り出す: aiOcr.ts の AI_OCR_MAX_PDF_PAGES） */
const MAX_PDF_PAGES = 10;
/** 文字で送るときのページ数・1ページの文字数・全体の文字数の上限 */
const MAX_TEXT_PAGES = 30;
const MAX_PAGE_CHARS = 4000;
const MAX_TOTAL_CHARS = 60000;
/** base64 にした PDF・画像の上限（API の 32MB に届かないよう、元のファイルで約 15MB） */
const MAX_BASE64_CHARS = 20 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png']);
const DAILY_LIMIT = Number(Deno.env.get('AI_OCR_DAILY_LIMIT') ?? '200');
const DAILY_LIMIT_PER_USER = Number(Deno.env.get('AI_OCR_DAILY_LIMIT_PER_USER') ?? '50');

export const NOT_CONFIGURED_MESSAGE = 'AI-OCR は未設定です（管理者に連絡）';

const DOCUMENT_TYPES = [
  '点検報告書',
  'リモート点検報告書',
  '警備報告書',
  '故障対応報告書',
  '見積書',
  '請求書',
  '契約書',
  '提案書',
  '建物関連情報',
  '写真',
  'その他',
];

// 構造化出力の形（output_config.format）。読めない項目は空文字にする（null を許す形より単純に保つ）
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'document_type',
    'target_month_text',
    'target_month',
    'performed_on_text',
    'performed_on',
    'vendor_name',
    'inspection_type',
    'pages',
  ],
  properties: {
    document_type: { type: 'string', enum: DOCUMENT_TYPES },
    target_month_text: { type: 'string', description: '「2026年10月分」など、対象年月が書かれた文字列そのまま。無ければ空' },
    target_month: { type: 'string', description: '対象年月を YYYY-MM で。無ければ空' },
    performed_on_text: { type: 'string', description: '実施日（点検日・作業日・発行日）が書かれた文字列そのまま。無ければ空' },
    performed_on: { type: 'string', description: '実施日を YYYY-MM-DD で（範囲なら開始日）。無ければ空' },
    vendor_name: { type: 'string', description: '書類を出した会社（保守会社・警備会社など）の名前。無ければ空' },
    inspection_type: { type: 'string', description: '点検・作業の種類（例: エレベーター定期点検）。無ければ空' },
    pages: {
      type: 'array',
      description: 'ページごとの建物名など。建物が1つでも、読めたページはすべて入れる',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['page', 'building_name', 'inspection_type', 'performed_on'],
        properties: {
          page: { type: 'integer', description: '1 始まりのページ番号' },
          building_name: { type: 'string', description: 'そのページの建物（マンション・ビル）名。書かれたまま。無ければ空' },
          inspection_type: { type: 'string', description: 'そのページの点検・作業の種類。無ければ空' },
          performed_on: { type: 'string', description: 'そのページの実施日 YYYY-MM-DD。無ければ空' },
        },
      },
    },
  },
} as const;

// プロンプトは固定（自己改善はプロンプトを変えず、画面側の辞書で行う）
const SYSTEM_PROMPT = `あなたは日本のマンション管理の書類を読む担当です。渡された書類（点検報告書・警備報告書・見積書・請求書など）から、指定の項目を書かれているとおりに読み取ってください。
- 推測で埋めないでください。書かれていない項目は空文字にします。
- 建物名・会社名は書類に書かれた表記のまま（略さず、直さず）返します。
- 日付は和暦（令和・R など）も西暦に直して YYYY-MM-DD、対象年月は YYYY-MM にします。元の文字列は *_text に入れます。
- 1つの書類に複数の建物が載っている場合は、ページごとに pages に入れます。`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST のみ対応しています' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'signage' },
  });

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: { user: caller } } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!caller) return json({ error: 'ログインが必要です' }, 401);
  const { data: profile } = await admin
    .from('signage_profiles').select('role, status').eq('id', caller.id).maybeSingle();
  if (!profile || profile.status !== 'active' || !['admin', 'user', 'management'].includes(profile.role)) {
    return json({ error: 'AI-OCR を使う権限がありません' }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'リクエストが不正です' }, 400);
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
  if (body.action === 'status') {
    return json({ configured: !!apiKey, model: MODEL, maxPdfPages: MAX_PDF_PAGES });
  }
  if (body.action !== 'read') return json({ error: '不明な操作です' }, 400);
  if (!apiKey) return json({ error: NOT_CONFIGURED_MESSAGE, code: 'not_configured' }, 503);

  // ---- 入力の確認と、モデルに渡す中身 ----
  const mode = body.mode;
  let content: Anthropic.ContentBlockParam[];
  let pageCount = 0;
  if (mode === 'text') {
    const pages = Array.isArray(body.pages) ? body.pages.filter((p): p is string => typeof p === 'string') : [];
    if (pages.length === 0) return json({ error: '読み取る文字がありません' }, 400);
    if (pages.length > MAX_TEXT_PAGES) return json({ error: `文字で送れるのは ${MAX_TEXT_PAGES} ページまでです` }, 400);
    const trimmed = pages.map((p) => p.slice(0, MAX_PAGE_CHARS));
    const text = trimmed.map((p, i) => `--- ${i + 1}ページ ---\n${p}`).join('\n');
    if (text.length > MAX_TOTAL_CHARS) return json({ error: '文字が多すぎます' }, 400);
    pageCount = pages.length;
    content = [{ type: 'text', text: `次の書類の文字情報（ページごと）から読み取ってください。\n\n${text}` }];
  } else if (mode === 'pdf' || mode === 'image') {
    const data = typeof body.data === 'string' ? body.data : '';
    if (!data || data.length > MAX_BASE64_CHARS || !/^[A-Za-z0-9+/=]+$/.test(data)) {
      return json({ error: 'ファイルが大きすぎるか、形式が不正です' }, 400);
    }
    if (mode === 'pdf') {
      try {
        const doc = await PDFDocument.load(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)), { ignoreEncryption: false });
        pageCount = doc.getPageCount();
      } catch {
        return json({ error: 'PDF を読めませんでした（パスワード付きの PDF は扱えません）' }, 400);
      }
      if (pageCount > MAX_PDF_PAGES) {
        return json({ error: `PDF で送れるのは ${MAX_PDF_PAGES} ページまでです` }, 400);
      }
      content = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } },
        { type: 'text', text: 'この書類から読み取ってください。' },
      ];
    } else {
      const mediaType = typeof body.mediaType === 'string' ? body.mediaType : '';
      if (!IMAGE_TYPES.has(mediaType)) return json({ error: '画像は JPEG・PNG だけ読めます' }, 400);
      pageCount = 1;
      content = [
        { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg' | 'image/png', data } },
        { type: 'text', text: 'この書類（画像）から読み取ってください。' },
      ];
    }
  } else {
    return json({ error: '読み取り方（mode）を指定してください' }, 400);
  }

  // ---- 1日の上限（日本時間の0時から）。モデルを呼ぶ前に枠を予約する ----
  const { data: usageId, error: reserveError } = await admin.rpc('ocr_reserve_usage', {
    p_user_id: caller.id,
    p_mode: mode,
    p_pages: pageCount,
    p_limit_total: DAILY_LIMIT,
    p_limit_user: DAILY_LIMIT_PER_USER,
  });
  if (reserveError) {
    return json({ error: `呼び出し回数の確認に失敗しました: ${reserveError.message}` }, 500);
  }
  if (usageId === null || usageId === undefined) {
    return json({ error: '今日の AI-OCR の上限に達しました（明日またお試しください）', code: 'daily_limit' }, 429);
  }

  const record = async (ok: boolean, usage: { input_tokens?: number; output_tokens?: number } | null, error: string | null) => {
    const row = {
      input_tokens: usage?.input_tokens ?? null,
      output_tokens: usage?.output_tokens ?? null,
      ok,
      error,
    };
    const { error: usageError } = await admin.from('signage_ocr_usage').update(row).eq('id', usageId);
    if (usageError) console.error('ocr usage update failed:', usageError.message);
    const { error: auditError } = await admin.from('signage_audit_logs').insert({
      table_name: 'ai_ocr',
      operation: 'AI_OCR',
      record_id: null,
      user_id: caller.id,
      new_data: { usage_id: usageId, user_id: caller.id, mode, pages: pageCount, ...row, model: MODEL },
    });
    if (auditError) console.error('audit log insert failed:', auditError.message);
  };

  // ---- 呼び出し（再試行は最大1回） ----
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 90_000 });
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      messages: [{ role: 'user', content }],
    });
    if (response.stop_reason === 'refusal') {
      await record(false, response.usage, 'refusal');
      return json({ error: 'この書類は AI-OCR で読めませんでした' }, 422);
    }
    if (response.stop_reason === 'max_tokens') {
      await record(false, response.usage, 'max_tokens');
      return json({ error: '読み取り結果が長すぎます（ページを分けてお試しください）' }, 422);
    }
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    let result: unknown;
    try {
      result = JSON.parse(text);
    } catch {
      await record(false, response.usage, 'invalid_json');
      return json({ error: '読み取り結果を解釈できませんでした' }, 502);
    }
    await record(true, response.usage, null);
    return json({ result, model: MODEL, mode, pages: pageCount });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      await record(false, null, 'rate_limit');
      return json({ error: 'AI-OCR が混み合っています（しばらくしてからお試しください）' }, 429);
    }
    if (err instanceof Anthropic.AuthenticationError) {
      await record(false, null, 'authentication');
      return json({ error: 'AI-OCR のキーが正しくありません（管理者に連絡）', code: 'not_configured' }, 503);
    }
    if (err instanceof Anthropic.APIError) {
      await record(false, null, `api_${err.status}`);
      return json({ error: `AI-OCR の呼び出しに失敗しました（${err.status}）` }, 502);
    }
    await record(false, null, 'network');
    return json({ error: 'AI-OCR に接続できませんでした' }, 502);
  }
});
