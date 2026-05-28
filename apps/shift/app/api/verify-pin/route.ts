import { NextResponse } from 'next/server'
import { verifyStaffPin } from '@/lib/notion'

export async function POST(req: Request) {
  try {
    const { name, pin } = await req.json()
    if (!name) return NextResponse.json({ valid: false })
    const valid = await verifyStaffPin(name, pin ?? '')
    return NextResponse.json({ valid })
  } catch {
    return NextResponse.json({ valid: false }, { status: 500 })
  }
}
