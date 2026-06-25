import { isAnomaly } from '@/lib/domain/engagement';
import type { Post } from '@/lib/domain/types';

export function PostsTable({ posts, population }: { posts: Post[]; population: number[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left no-border-table">
        <thead className="bg-surface-container/30 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
          <tr>
            <th className="px-8 py-5 w-20">排名</th>
            <th className="px-6 py-5">發布時間</th>
            <th className="px-6 py-5">帳號</th>
            <th className="px-6 py-5">內容摘要</th>
            <th className="px-4 py-5 text-center">互動量</th>
            <th className="px-4 py-5 text-center">讚</th>
            <th className="px-4 py-5 text-center">留言</th>
            <th className="px-4 py-5 text-center">媒體</th>
            <th className="px-8 py-5 text-right">連結</th>
          </tr>
        </thead>
        <tbody className="text-[13px] divide-y divide-outline-variant/5">
          {posts.length === 0 && (
            <tr>
              <td colSpan={9} className="px-8 py-16 text-center text-on-surface-variant/50">
                此視角暫無資料
              </td>
            </tr>
          )}
          {posts.map((p, i) => (
            <tr key={p.postUrl ?? i} className="table-row-hover transition-colors">
              <td className="px-8 py-5">
                <div className="flex items-center gap-3">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      isAnomaly(p.engagementTotal ?? 0, population) ? 'bg-sentiment-neg' : 'bg-transparent'
                    }`}
                    title={isAnomaly(p.engagementTotal ?? 0, population) ? '爆款 (+2σ)' : undefined}
                  />
                  <span className="font-black text-primary">{String(i + 1).padStart(2, '0')}</span>
                </div>
              </td>
              <td className="px-6 py-5 text-on-surface-variant/80">{new Date(p.postTime).toLocaleString()}</td>
              <td className="px-6 py-5 font-bold">{p.username}</td>
              <td className="px-6 py-5 max-w-[220px] truncate text-on-surface-variant">{p.content}</td>
              <td className="px-4 py-5 text-center font-extrabold text-primary">{(p.engagementTotal ?? 0).toLocaleString()}</td>
              <td className="px-4 py-5 text-center text-on-surface-variant">{(p.likes ?? 0).toLocaleString()}</td>
              <td className="px-4 py-5 text-center text-on-surface-variant">{(p.comments ?? 0).toLocaleString()}</td>
              <td className="px-4 py-5 text-center text-on-surface-variant">{p.mediaType}</td>
              <td className="px-8 py-5 text-right">
                {p.postUrl && (
                  <a className="text-primary font-bold hover:underline" href={p.postUrl} target="_blank" rel="noreferrer">
                    查看
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
