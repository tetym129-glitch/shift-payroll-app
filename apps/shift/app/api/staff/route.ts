import { NextResponse } from 'next/server'
import { getStaff, addStaff, deactivateStaff } from '@/lib/notion'

export async function GET() {
  try {
    return NextResponse.json(await getStaff())
  } catch {
    return NextResponse.json({ error: 'スタッフ情報の取得に失敗しました' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { name } = await req.json()
    if (!name) return NextResponse.json({ error: '名前が必要です' }, { status: 400 })
    return NextResponse.json(await addStaff(name))
  } catch {
    return NextResponse.json({ error: 'スタッフの追加に失敗しました' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'IDが必要です' }, { status: 400 })
    await deactivateStaff(id)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'スタッフの削除に失敗しました' }, { status: 500 })
  }
}
