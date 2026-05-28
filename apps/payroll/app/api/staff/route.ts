import { NextResponse } from 'next/server'
import { getStaff } from '@/lib/notion'

export async function GET() {
  try {
    const staff = await getStaff()
    return NextResponse.json(staff)
  } catch (error) {
    console.error('Failed to fetch staff:', error)
    return NextResponse.json({ error: 'Failed to fetch staff' }, { status: 500 })
  }
}
