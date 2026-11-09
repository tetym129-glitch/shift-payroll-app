import { NextResponse } from 'next/server'
import { checkStaffPin, getSlipImage } from '@/lib/meisai'

export const dynamic = 'force-dynamic'

// 1か月分の明細画像。毎回パスワードを確かめてから渡す
// - 画面に出すとき：JSONで送ってくる → 画像をそのまま返す
// - Androidで保存するとき：フォームで送ってくる（download=1）→「ダウンロード」として返す
export async function POST(req: Request) {
  const isForm = (req.headers.get('content-type') ?? '').includes('form')
  let name = '', pin = '', month = '', download = false
  try {
    if (isForm) {
      const f = await req.formData()
      name = String(f.get('name') ?? '')
      pin = String(f.get('pin') ?? '')
      month = String(f.get('month') ?? '')
      download = f.get('download') === '1'
    } else {
      const j = await req.json()
      name = String(j.name ?? '')
      pin = String(j.pin ?? '')
      month = String(j.month ?? '')
    }
  } catch {
    return NextResponse.json({ error: '送り方がちがいます' }, { status: 400 })
  }

  // ダウンロードのときにエラーの文字を返すと、画面がその文字に切りかわってしまうので「何もしない」を返す
  const fail = (status: number, error: string) =>
    download ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error }, { status })

  try {
    const result = await checkStaffPin(name, pin)
    if (result !== 'ok') return fail(401, 'パスワードを確かめられませんでした')
    const img = await getSlipImage(name, month)
    if (!img) return fail(404, '明細が見つかりません')
    const headers: Record<string, string> = { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' }
    if (download) {
      const filename = `給与明細_${month}_${name}.png`
      headers['Content-Disposition'] = `attachment; filename="meisai_${month}.png"; filename*=UTF-8''${encodeURIComponent(filename)}`
    }
    return new NextResponse(img, { headers })
  } catch (error) {
    console.error('meisai image:', error)
    return fail(500, '画像を読み込めませんでした')
  }
}
