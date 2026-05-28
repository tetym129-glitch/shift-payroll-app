import { NextResponse } from 'next/server'
import { getShiftSubmission, upsertShiftSubmission, getAllSubmissions } from '@/lib/notion'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const staff = searchParams.get('staff')
    const period = searchParams.get('period')
    if (!period) return NextResponse.json({ error: '期間が必要です' }, { status: 400 })
    if (staff) return NextResponse.json(await getShiftSubmission(staff, period))
    return NextResponse.json(await getAllSubmissions(period))
  } catch {
    return NextResponse.json({ error: 'シフト情報の取得に失敗しました' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { staff, period, shifts } = await req.json()
    if (!staff || !period || !shifts) {
      return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400 })
    }
    return NextResponse.json(await upsertShiftSubmission(staff, period, shifts))
  } catch {
    return NextResponse.json({ error: 'シフトの保存に失敗しました' }, { status: 500 })
  }
}
