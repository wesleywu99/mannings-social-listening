import { config } from 'dotenv'; config({ path: '.env.local' });
import { sendMail } from '../src/lib/email/gmail';
async function main() {
  const to = process.argv[2] || 'wesleywu@fimmick.com';
  await sendMail(to, 'Mannings 報告測試 ✅', '<div style="font-family:Arial,sans-serif;padding:16px"><h2 style="color:#171717">測試成功</h2><p style="color:#4d4d4d">這是 Mannings Social Listening 的 Email 測試。收到代表 Gmail SA 網域委派寄信已打通 🎉</p></div>');
  console.log('SENT ->', to);
}
main().then(() => process.exit(0)).catch((e) => { console.error('SEND FAILED:', e?.response?.data?.error ?? e?.message ?? e); process.exit(1); });
