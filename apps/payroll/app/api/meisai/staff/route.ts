import { NextResponse } from 'next/server'
import { getActiveStaffNames } from '@/lib/meisai'

export const dynamic = 'force-dynamic'

// 明細アプリの最初の画面に出す名前（今いるスタッフだけ）
export async function GET() {
  try {
    return NextResponse.json({ names: await getActiveStaffNames() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('meisai staff:', error)
    return NextResponse.json({ error: '名前を読み込めませんでした' }, { status: 500 })
  }
}
