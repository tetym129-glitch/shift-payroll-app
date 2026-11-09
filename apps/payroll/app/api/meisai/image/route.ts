import { NextResponse } from 'next/server'
import { checkStaffPin, getSlipImage } from '@/lib/meisai'

export const dynamic = 'force-dynamic'

// 1か月分の明細画像。毎回パスワードを確かめてから渡す
export async function POST(req: Request) {
  try {
    const { name, pin, month } = await req.json()
    const result = await checkStaffPin(String(name ?? ''), String(pin ?? ''))
    if (result !== 'ok') return NextResponse.json({ error: 'パスワードを確かめられませんでした' }, { status: 401 })
    const img = await getSlipImage(name, String(month ?? ''))
    if (!img) return NextResponse.json({ error: '明細が見つかりません' }, { status: 404 })
    return new NextResponse(img, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    console.error('meisai image:', error)
    return NextResponse.json({ error: '画像を読み込めませんでした' }, { status: 500 })
  }
}
