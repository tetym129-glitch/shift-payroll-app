import { NextRequest, NextResponse } from 'next/server'
import { verifyOwnerPin } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { pin } = await req.json()
  const valid = verifyOwnerPin(pin)
  return NextResponse.json({ valid })
}
