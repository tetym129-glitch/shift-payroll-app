import { NextResponse } from 'next/server'
import { Client } from '@notionhq/client'
import { verifyOwnerPin } from '@/lib/auth'
import { getStaff } from '@/lib/notion'

// シフト作成アプリ（徹さん専用・Firebase）が、スタッフのシフト希望を読みに来る口。給料計算と同じPINが必要
export const dynamic = 'force-dynamic'

const notion = new Client({ auth: process.env.NOTION_API_KEY })
const ALLOWED_ORIGINS = ['https://sio-shift.web.app', 'https://sio-shift.firebaseapp.com', 'http://localhost:5050']

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'x-owner-pin',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}

// 希望のデータベースは名前「シフト希望」で探す（IDを公開リポジトリに書かないため）
let shiftsDbId = process.env.NOTION_SHIFTS_DB_ID ?? ''
async function findShiftsDb(): Promise<string> {
  if (shiftsDbId) return shiftsDbId
  const res = await notion.search({ query: 'シフト希望', filter: { property: 'object', value: 'database' } })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (res.results as any[]).find(d => d.properties?.ShiftsData && d.properties?.Period)
  if (!db) throw new Error('シフト希望のデータベースが見つかりません')
  shiftsDbId = db.id
  return shiftsDbId
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) })
}

export async function GET(req: Request) {
  const headers = corsHeaders(req)
  if (!verifyOwnerPin(req.headers.get('x-owner-pin') ?? '') || !(process.env.OWNER_PIN || process.env.ADMIN_PIN)) {
    return NextResponse.json({ error: 'PINがちがいます' }, { status: 401, headers })
  }
  const period = new URL(req.url).searchParams.get('period') ?? ''
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: '月の指定がありません' }, { status: 400, headers })
  }
  try {
    const [staff, res] = await Promise.all([
      getStaff(),
      findShiftsDb().then(id => notion.databases.query({
        database_id: id,
        filter: { property: 'Period', rich_text: { equals: period } },
      })),
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const submissions = (res.results as any[]).map(page => ({
      staff: page.properties.Staff.rich_text[0]?.plain_text ?? '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      shifts: JSON.parse(page.properties.ShiftsData.rich_text.map((t: any) => t.plain_text).join('') || '{}'),
      updatedAt: page.properties.UpdatedAt.date?.start ?? null,
    }))
    return NextResponse.json({ period, staff: staff.map(s => s.name), submissions }, { headers })
  } catch (error) {
    console.error('Failed to export hopes:', error)
    return NextResponse.json({ error: '希望の読み込みに失敗しました' }, { status: 500, headers })
  }
}
