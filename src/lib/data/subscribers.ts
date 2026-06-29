import { createServiceClient } from '@/lib/supabase/server';
import { DEFAULT_BRAND } from '@/lib/config';

export interface Subscriber { email: string; createdAt: string; }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export async function listSubscribers(brand = DEFAULT_BRAND): Promise<Subscriber[]> {
  const supa = createServiceClient();
  const { data, error } = await supa.from('subscribers')
    .select('email, created_at').eq('brand', brand).eq('active', true)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({ email: r.email as string, createdAt: r.created_at as string }));
}

/** 加入訂閱（冪等：同 email 已存在則重新啟用） */
export async function addSubscriber(email: string, brand = DEFAULT_BRAND): Promise<void> {
  const clean = email.trim().toLowerCase();
  if (!isValidEmail(clean)) throw new Error('Invalid email');
  const supa = createServiceClient();
  const { error } = await supa.from('subscribers')
    .upsert({ email: clean, brand, active: true }, { onConflict: 'email,brand' });
  if (error) throw error;
}

/** 移除訂閱（軟刪除：active=false，保留歷史） */
export async function removeSubscriber(email: string, brand = DEFAULT_BRAND): Promise<void> {
  const clean = email.trim().toLowerCase();
  const supa = createServiceClient();
  const { error } = await supa.from('subscribers')
    .update({ active: false }).eq('email', clean).eq('brand', brand);
  if (error) throw error;
}
