// Supabase Edge Function: 管理者へのメール通知
// 新規申請があった際に管理者へメール送信

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") || "admin@example.com";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "noreply@signage-form.com";

interface EntryPayload {
  type: "INSERT";
  table: string;
  record: {
    id: string;
    property_code: string;
    vendor_name: string;
    inspection_type: string;
    start_date: string;
    end_date: string;
    status: string;
    created_at: string;
  };
  old_record: null;
}

serve(async (req) => {
  try {
    const payload: EntryPayload = await req.json();

    // 新規申請（status=pending）のみ通知
    if (payload.record.status !== "pending") {
      return new Response(JSON.stringify({ message: "Not a pending entry, skipping" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const entry = payload.record;

    const emailHtml = `
      <h2>新規点検申請がありました</h2>
      <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px; background: #f5f5f5;"><strong>物件コード</strong></td>
          <td style="border: 1px solid #ddd; padding: 8px;">${entry.property_code}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px; background: #f5f5f5;"><strong>受注先</strong></td>
          <td style="border: 1px solid #ddd; padding: 8px;">${entry.vendor_name}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px; background: #f5f5f5;"><strong>点検種別</strong></td>
          <td style="border: 1px solid #ddd; padding: 8px;">${entry.inspection_type}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px; background: #f5f5f5;"><strong>点検期間</strong></td>
          <td style="border: 1px solid #ddd; padding: 8px;">${entry.start_date} 〜 ${entry.end_date}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px; background: #f5f5f5;"><strong>申請日時</strong></td>
          <td style="border: 1px solid #ddd; padding: 8px;">${new Date(entry.created_at).toLocaleString("ja-JP")}</td>
        </tr>
      </table>
      <p style="margin-top: 20px;">
        <a href="https://your-domain.com/admin.html" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">
          管理画面で確認する
        </a>
      </p>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: ADMIN_EMAIL,
        subject: `【点検申請】${entry.inspection_type} - ${entry.property_code}`,
        html: emailHtml,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Resend API error:", data);
      return new Response(JSON.stringify({ error: data }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, id: data.id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
