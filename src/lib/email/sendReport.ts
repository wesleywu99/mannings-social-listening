import { getLatestReport } from '@/lib/data/reports';
import { listSubscribers } from '@/lib/data/subscribers';
import { sendMail } from './gmail';
import { renderReportEmail } from './renderReport';
import { DEFAULT_BRAND } from '@/lib/config';

export interface SendResult { report: boolean; total: number; sent: number; failed: string[]; }

/** 寄送最新報告：to 指定收件人（測試）；否則寄給該品牌所有訂閱者。逐封寄（保護彼此 email 隱私）。 */
export async function sendReport(opts: { brand?: string; to?: string[] } = {}): Promise<SendResult> {
  const brand = opts.brand ?? DEFAULT_BRAND;
  const report = await getLatestReport(brand);
  if (!report) return { report: false, total: 0, sent: 0, failed: [] };

  const recipients = opts.to ?? (await listSubscribers(brand)).map((s) => s.email);
  const html = renderReportEmail(report);
  const subject = `Mannings 社媒報告 ${report.dateStart} ~ ${report.dateEnd}`;

  let sent = 0;
  const failed: string[] = [];
  for (const to of recipients) {
    try { await sendMail(to, subject, html); sent++; }
    catch (e) { console.error('[sendReport] failed', to, e); failed.push(to); }
  }
  return { report: true, total: recipients.length, sent, failed };
}
