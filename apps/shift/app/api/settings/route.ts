import { NextResponse } from 'next/server'
import { getSettings, updateSettings } from '@/lib/notion'

export async function GET() {
  try {
    return NextResponse.json(await getSettings())
  } catch {
    return NextResponse.json({ error: '設定の取得に失敗しました' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json()
    await updateSettings(data)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: '設定の保存に失敗しました' }, { status: 500 })
  }
}
