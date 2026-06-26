import { Nav } from '@/components/Nav';
import { InsightClient } from '@/components/insight/InsightClient';

export default function InsightPage() {
  return (
    <main className="p-6 md:p-10 max-w-5xl mx-auto">
      <header className="mb-8 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[2rem] leading-tight font-semibold tracking-[-0.04em] text-on-surface">AI Insight Center</h1>
          <p className="text-sm text-on-surface-variant mt-1.5">Deep social listening analysis and decision support.</p>
        </div>
        <Nav />
      </header>
      <InsightClient />
    </main>
  );
}
