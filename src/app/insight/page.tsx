import { Nav } from '@/components/Nav';
import { InsightClient } from '@/components/insight/InsightClient';

export default function InsightPage() {
  return (
    <main className="p-6 md:p-10 max-w-5xl mx-auto">
      <header className="mb-8 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">AI Insight Center</h1>
          <p className="text-xs text-on-surface-variant/60 mt-0.5">智能社媒輿情深層分析與決策支持</p>
        </div>
        <Nav />
      </header>
      <InsightClient />
    </main>
  );
}
