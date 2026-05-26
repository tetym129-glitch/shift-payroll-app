import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { pin } = await req.json()
  const valid = pin === process.env.ADMIN_PIN
  return NextResponse.json({ valid })
}
