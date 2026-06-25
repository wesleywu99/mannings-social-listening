import { NextResponse } from 'next/server';
import { listBrands } from '@/lib/data/posts';

export async function GET() {
  return NextResponse.json(await listBrands());
}
