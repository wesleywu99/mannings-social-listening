import type { Post, Platform } from '@/lib/domain/types';
import { metricColumns, fmtTime } from './columns';

/** 把貼文轉成 CSV（欄位與表格一致，平台感知）。供前端 Blob 下載。 */
export function buildPostsCsv(posts: Post[], platform: Platform): string {
  const cols = metricColumns(platform);
  const headers = ['Post Time', 'Username', 'Content', ...cols.map((c) => c.label), 'Media', 'Post URL'];
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = posts.map((p) =>
    [fmtTime(p.postTime), p.username ?? '', p.content ?? '', ...cols.map((c) => c.get(p) ?? 0), p.mediaType ?? '', p.postUrl ?? '']
      .map(esc).join(','),
  );
  return [headers.join(','), ...rows].join('\r\n');
}

/** 觸發瀏覽器下載（含 UTF-8 BOM，讓 Excel 正確顯示中文） */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
