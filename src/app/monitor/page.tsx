import { MonitorClient } from '@/components/monitor/MonitorClient';
import { Nav } from '@/components/Nav';
import { SubscribeButton } from '@/components/SubscribeButton';

export default function MonitorPage() {
  return (
    <main className="p-6 md:p-10 max-w-7xl mx-auto">
      <header className="mb-8 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[2rem] leading-tight font-semibold tracking-[-0.04em] text-on-surface">Analytics Dashboard</h1>
          <p className="text-sm text-on-surface-variant mt-1.5">Social media monitoring and competitor analysis.</p>
        </div>
        <div className="flex items-center gap-2">
          <SubscribeButton />
          <Nav />
        </div>
      </header>
      <MonitorClient />
    </main>
  );
}
