import { redirect } from 'next/navigation';

// 根路徑導向監控頁，並保留 ?token（讓 proxy gate 設下 cookie）
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  redirect(token ? `/monitor?token=${encodeURIComponent(token)}` : '/monitor');
}
