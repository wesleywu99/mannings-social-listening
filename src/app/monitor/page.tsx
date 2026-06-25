import { MonitorClient } from '@/components/monitor/MonitorClient';

export default function MonitorPage() {
  return (
    <main className="p-6 md:p-10 max-w-7xl mx-auto">
      <header className="mb-10">
        <h1 className="text-xl font-extrabold tracking-tight">數據監測工作台</h1>
        <p className="text-xs text-on-surface-variant/60 mt-0.5">社交媒體數據監測與競品分析</p>
      </header>
      <MonitorClient />
    </main>
  );
}
