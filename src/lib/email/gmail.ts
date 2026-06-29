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

/** 內嵌圖片（CID）：HTML 以 <img src="cid:cid"> 引用，圖片隨信送出（無外部請求） */
export interface InlineImage { cid: string; content: Buffer; contentType?: string }

// RFC 2045：base64 每 76 字元換行（大附件較保險）
const b64wrap = (buf: Buffer) => buf.toString('base64').replace(/(.{76})/g, '$1\r\n');

/** 用 Gmail API + SA 網域全權委派（模擬 GMAIL_SENDER）寄 HTML 信，可含內嵌圖片。 */
export async function sendMail(
  to: string | string[], subject: string, html: string, images?: InlineImage[],
): Promise<void> {
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
  const headers = [
    `From: Mannings Social Listening <${sender}>`,
    `To: ${recipients}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
    'MIME-Version: 1.0',
  ];
  const htmlPart = ['Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64wrap(Buffer.from(html, 'utf8'))];

  let mime: string;
  if (images?.length) {
    const boundary = `mns-${Date.now().toString(36)}`;
    const parts: string[] = [`--${boundary}`, ...htmlPart];
    for (const img of images) {
      parts.push(
        `--${boundary}`,
        `Content-Type: ${img.contentType ?? 'image/png'}`,
        'Content-Transfer-Encoding: base64',
        `Content-ID: <${img.cid}>`,
        `Content-Disposition: inline; filename="${img.cid}.png"`,
        '', b64wrap(img.content),
      );
    }
    parts.push(`--${boundary}--`, '');
    mime = [...headers, `Content-Type: multipart/related; boundary="${boundary}"`, '', parts.join('\r\n')].join('\r\n');
  } else {
    mime = [...headers, ...htmlPart].join('\r\n');
  }

  const raw = Buffer.from(mime, 'utf8').toString('base64url');
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
}
