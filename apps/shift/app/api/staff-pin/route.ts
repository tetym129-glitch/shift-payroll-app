import { NextResponse } from 'next/server'
import { setStaffPin, removeStaffPin, getStaffPinsStatus } from '@/lib/notion'

export async function GET() {
  try {
    return NextResponse.json(await getStaffPinsStatus())
  } catch {
    return NextResponse.json({}, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { name, pin } = await req.json()
    if (!name) return NextResponse.json({ error: '名前が必要です' }, { status: 400 })
    if (!pin) {
      await removeStaffPin(name)
    } else {
      if (!/^\d{4}$/.test(pin)) return NextResponse.json({ error: '4桁の数字で入力してください' }, { status: 400 })
      await setStaffPin(name, pin)
    }
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: '失敗しました' }, { status: 500 })
  }
}
