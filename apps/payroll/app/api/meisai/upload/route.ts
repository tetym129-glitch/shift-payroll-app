import { NextResponse } from 'next/server'
import { verifyOwnerPin } from '@/lib/auth'
import { getActiveStaffNames, saveSlip, savedNamesForMonth } from '@/lib/meisai'

export const dynamic = 'force-dynamic'

function ownerOk(req: Request): boolean {
  const pin = req.headers.get('x-owner-pin') ?? ''
  return !!(process.env.OWNER_PIN || process.env.ADMIN_PIN) && verifyOwnerPin(pin)
}

// 徹さん用：その月にもう入っている人の一覧（PINの確認にも使う）
export async function GET(req: Request) {
  if (!ownerOk(req)) return NextResponse.json({ error: 'PINがちがいます' }, { status: 401 })
  const month = new URL(req.url).searchParams.get('month') ?? ''
  try {
    const [names, saved] = await Promise.all([getActiveStaffNames(), month ? savedNamesForMonth(month) : []])
    return NextResponse.json({ names, saved })
  } catch (error) {
    console.error('meisai saved list:', error)
    return NextResponse.json({ error: '読み込めませんでした' }, { status: 500 })
  }
}

// 徹さん用：1人分の明細画像を入れる（同じ月があれば入れ替え・古いほうはNotionのごみ箱へ）
export async function POST(req: Request) {
  if (!ownerOk(req)) return NextResponse.json({ error: 'PINがちがいます' }, { status: 401 })
  try {
    const { name, month, png } = await req.json()
    const names = await getActiveStaffNames()
    if (!names.includes(name)) return NextResponse.json({ error: `${name} さんはスタッフ一覧にいません` }, { status: 400 })
    const buf = Buffer.from(String(png ?? '').replace(/^data:image\/png;base64,/, ''), 'base64')
    if (buf.length < 1000 || buf.length > 4_000_000) return NextResponse.json({ error: '画像の大きさがおかしいです' }, { status: 400 })
    await saveSlip(name, String(month ?? ''), buf)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('meisai upload:', error)
    return NextResponse.json({ error: '保存できませんでした' }, { status: 500 })
  }
}
