import 'server-only';
import { createServiceClient } from '@/lib/supabase/server';
import type { ReportSections } from '@/lib/ai/report';

export interface StoredReport extends ReportSections {
  brand: string;
  dateStart: string;
  dateEnd: string;
  generatedAt: string;
}

/** 取該品牌資料的實際日期範圍（無篩選時用作報告期間） */
export async function deriveDateRange(brand: string): Promise<{ start: string; end: string }> {
  const supa = createServiceClient();
  const [{ data: lo }, { data: hi }] = await Promise.all([
    supa.from('posts').select('post_time').eq('brand', brand).order('post_time', { ascending: true }).limit(1),
    supa.from('posts').select('post_time').eq('brand', brand).order('post_time', { ascending: false }).limit(1),
  ]);
  return {
    start: (lo?.[0]?.post_time as string | undefined)?.slice(0, 10) ?? '',
    end: (hi?.[0]?.post_time as string | undefined)?.slice(0, 10) ?? '',
  };
}

export async function saveReport(brand: string, dateStart: string, dateEnd: string, s: ReportSections): Promise<void> {
  const supa = createServiceClient();
  const { error } = await supa.from('ai_reports').upsert({
    brand, date_start: dateStart, date_end: dateEnd,
    summary: s.summary, advice: s.advice, content: s.content,
    platform: s.platform, kol: s.kol, ig_rate: s.igRate,
    generated_at: new Date().toISOString(),
  }, { onConflict: 'brand,date_start,date_end' });
  if (error) throw error;
}

export async function getLatestReport(brand: string): Promise<StoredReport | null> {
  const supa = createServiceClient();
  const { data, error } = await supa.from('ai_reports').select('*')
    .eq('brand', brand).order('generated_at', { ascending: false }).limit(1);
  if (error) throw error;
  const r = data?.[0];
  if (!r) return null;
  return {
    brand: r.brand, dateStart: r.date_start, dateEnd: r.date_end, generatedAt: r.generated_at,
    summary: r.summary ?? '', advice: r.advice ?? '', content: r.content ?? '',
    platform: r.platform ?? '', kol: r.kol ?? '', igRate: r.ig_rate ?? '',
  };
}
