import { NextResponse } from 'next/server'
import { getNotifications, getUnreadCounts, createNotification, markNotificationsRead } from '@/lib/notion'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const staff = searchParams.get('staff')
    const counts = searchParams.get('counts')
    if (counts) return NextResponse.json(await getUnreadCounts())
    if (!staff) return NextResponse.json({ error: 'スタッフ名が必要です' }, { status: 400 })
    return NextResponse.json(await getNotifications(staff))
  } catch {
    return NextResponse.json({ error: '通知の取得に失敗しました' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { staff, message } = await req.json()
    if (!staff || !message) {
      return NextResponse.json({ error: 'スタッフと本文が必要です' }, { status: 400 })
    }
    await createNotification(staff, message)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: '通知の作成に失敗しました' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const { staff } = await req.json()
    if (!staff) return NextResponse.json({ error: 'スタッフ名が必要です' }, { status: 400 })
    await markNotificationsRead(staff)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: '通知の更新に失敗しました' }, { status: 500 })
  }
}
