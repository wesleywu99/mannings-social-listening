import { google } from 'googleapis';
import { readFileSync } from 'node:fs';

interface SACreds { client_email: string; private_key: string; }

/** SA 憑證：優先 env JSON（Vercel），否則讀本機檔案路徑（dev） */
function loadCreds(): SACreds {
  const json = process.env.GOOGLE_SA_CREDENTIALS;
  if (json) return JSON.parse(json) as SACreds;
  const path = process.env.GOOGLE_SA_KEY_PATH;
  if (!path) throw new Error('Missing GOOGLE_SA_CREDENTIALS or GOOGLE_SA_KEY_PATH');
  return JSON.parse(readFileSync(path, 'utf8')) as SACreds;
}

/** 用 Gmail API + SA 網域全權委派（模擬 GMAIL_SENDER）寄 HTML 信。 */
export async function sendMail(to: string | string[], subject: string, html: string): Promise<void> {
  const sender = process.env.GMAIL_SENDER;
  if (!sender) throw new Error('Missing GMAIL_SENDER');
  const creds = loadCreds();

  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
    subject: sender, // 模擬此真實信箱寄出（需網域全權委派）
  });
  const gmail = google.gmail({ version: 'v1', auth });

  const recipients = Array.isArray(to) ? to.join(', ') : to;
  const mime = [
    `From: Mannings Social Listening <${sender}>`,
    `To: ${recipients}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf8').toString('base64'),
  ].join('\r\n');
  const raw = Buffer.from(mime, 'utf8').toString('base64url');

  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
}
