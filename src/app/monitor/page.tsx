import { MonitorClient } from '@/components/monitor/MonitorClient';
import { Nav } from '@/components/Nav';

export default function MonitorPage() {
  return (
    <main className="p-6 md:p-10 max-w-7xl mx-auto">
      <header className="mb-10 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">數據監測工作台</h1>
          <p className="text-xs text-on-surface-variant/60 mt-0.5">社交媒體數據監測與競品分析</p>
        </div>
        <Nav />
      </header>
      <MonitorClient />
    </main>
  );
}
