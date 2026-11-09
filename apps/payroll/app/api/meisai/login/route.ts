import { NextResponse } from 'next/server'
import { checkStaffPin, listMonths } from '@/lib/meisai'

export const dynamic = 'force-dynamic'

const MESSAGES = {
  wrong: 'パスワードがちがいます',
  nopin: 'パスワードがまだ決まっていません。徹さんに伝えてください',
  locked: '何回もまちがえたので、10分たってからもう一度ためしてください',
}

// 名前とパスワード（シフト希望アプリと同じ4桁）→ 明細がある月の一覧
export async function POST(req: Request) {
  try {
    const { name, pin } = await req.json()
    const result = await checkStaffPin(String(name ?? ''), String(pin ?? ''))
    if (result !== 'ok') {
      return NextResponse.json({ error: MESSAGES[result] }, { status: 401 })
    }
    return NextResponse.json({ months: await listMonths(name) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('meisai login:', error)
    return NextResponse.json({ error: 'うまくつながりませんでした。もう一度ためしてください' }, { status: 500 })
  }
}
