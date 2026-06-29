import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { renderReportEmail } from '../src/lib/email/renderReport';
import { sendMail } from '../src/lib/email/gmail';
import type { StoredReport } from '../src/lib/data/reports';

// 用法：npm run send-report [email]  —— 有 email 測試寄；無則寄給所有訂閱者
const BRAND = 'Mannings';

async function main() {
  const arg = process.argv[2];
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  const { data } = await s.from('ai_reports').select('*').eq('brand', BRAND).order('generated_at', { ascending: false }).limit(1);
  const r = data?.[0];
  if (!r) { console.error('尚未生成報告（ai_reports 為空），請先在 Insight 頁生成日報'); process.exit(1); }
  const report: StoredReport = {
    brand: r.brand, dateStart: r.date_start, dateEnd: r.date_end, generatedAt: r.generated_at,
    summary: r.summary ?? '', advice: r.advice ?? '', content: r.content ?? '',
    platform: r.platform ?? '', kol: r.kol ?? '', sentiment: r.sentiment ?? '', topics: r.topics ?? '', competitor: r.competitor ?? '',
  };

  let recipients: string[];
  if (arg) recipients = [arg];
  else {
    const { data: subs } = await s.from('subscribers').select('email').eq('brand', BRAND).eq('active', true);
    recipients = (subs ?? []).map((x) => x.email as string);
  }
  if (!recipients.length) { console.error('無收件人（無訂閱者）'); process.exit(1); }

  const html = renderReportEmail(report);
  const subject = `Mannings 社媒報告 ${report.dateStart} ~ ${report.dateEnd}`;
  let sent = 0;
  for (const to of recipients) {
    try { await sendMail(to, subject, html); sent++; } catch (e) { console.error('寄送失敗', to, (e as { message?: string })?.message ?? e); }
  }
  console.log(`報告寄送：成功 ${sent}/${recipients.length}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e?.response?.data?.error ?? e?.message ?? e); process.exit(1); });
