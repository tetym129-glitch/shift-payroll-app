'use client'

// 徹さん用：毎月の「給料明細 公式」PDFを落とすだけで、1人ずつ切り取って明細アプリに入れる
import { useCallback, useEffect, useState } from 'react'

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174'
const SCALE = 12 // 1pt = 12px（約860dpi）。見本の画像と同じくらいの細かさ

type Cut = {
  id: number
  pdfName: string // PDFに書いてある名前
  staff: string // 保存する名前（'' = 保存しない）
  monthOnSlip: string
  dataUrl: string
  status: 'ready' | 'saving' | 'saved' | 'error'
  message?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare global { interface Window { pdfjsLib?: any } }

function loadPdfJs(): Promise<NonNullable<Window['pdfjsLib']>> {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib)
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = `${PDFJS}/pdf.min.js`
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.js`
      resolve(window.pdfjsLib)
    }
    s.onerror = () => reject(new Error('PDFを読む部品を読み込めませんでした'))
    document.head.appendChild(s)
  })
}

type Item = { str: string; x0: number; x1: number; top: number; base: number }

const isDark = (d: Uint8ClampedArray, i: number) => d[i] < 140 && d[i + 1] < 140 && d[i + 2] < 140

// PDF 1ページから明細を全部切り取る
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cutPage(page: any): Promise<{ name: string; month: string; year: string; canvas: HTMLCanvasElement }[]> {
  const vp1 = page.getViewport({ scale: 1 })
  const tc = await page.getTextContent()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: Item[] = tc.items.filter((it: any) => it.str?.trim()).map((it: any) => {
    const [x, y] = vp1.convertToViewportPoint(it.transform[4], it.transform[5])
    const h = Math.hypot(it.transform[2], it.transform[3]) || it.height || 5
    return { str: it.str, x0: x, x1: x + it.width, top: y - h, base: y }
  })

  const titles = items.filter(i => i.str.replace(/\s/g, '').includes('給与支払明細書'))
  titles.sort((a, b) => Math.round(a.top) - Math.round(b.top) || a.x0 - b.x0)
  const out = []
  for (const t of titles) {
    const cx = (t.x0 + t.x1) / 2
    const inCol = (i: Item) => Math.abs((i.x0 + i.x1) / 2 - cx) < 38
    // この明細の「差引支給額」の行（タイトルより下で一番近いもの）
    const sashi = items
      .filter(i => inCol(i) || (i.x0 > cx - 40 && i.x0 < cx - 20))
      .filter(i => i.str.trim().startsWith('差') && i.top > t.base && i.top < t.base + 160)
      .sort((a, b) => a.top - b.top)[0]
    if (!sashi) continue
    // 「○○　○○　殿」の行（文字がばらばらに入っていることがあるので、横に並べてつなぐ）
    const dono = items.find(i => i.str.includes('殿') && i.top > t.base && i.top < t.base + 30 && i.x1 > cx - 40 && i.x0 < cx + 40)
    const nameRow = items
      .filter(i => dono && Math.abs(i.base - dono.base) < 2 && i.x1 > cx - 40 && i.x0 < cx + 40)
      .sort((a, b) => a.x0 - b.x0)
      .map(i => i.str)
      .join('　')
    const name = nameRow.split('殿')[0].trim().split(/[\s　]+/).filter(Boolean)[0] ?? ''
    const near = items.filter(i => i.top >= t.base - 1 && i.top < t.base + 12 && Math.abs((i.x0 + i.x1) / 2 - cx) < 30)
    const joined = near.map(i => i.str).join(' ')
    const month = joined.match(/(\d{1,2})\s*月分/)?.[1] ?? ''
    const year = joined.match(/(\d{1,2})\s*年/)?.[1] ?? ''

    // 少し広めに描いてから、表の太い枠線を探して切る
    const rx0 = cx - 41.2, rx1 = cx + 41.2
    const ry0 = t.top - 6, ry1 = sashi.base + 8
    const W = Math.ceil((rx1 - rx0) * SCALE), H = Math.ceil((ry1 - ry0) * SCALE)
    const big = document.createElement('canvas')
    big.width = W
    big.height = H
    const ctx = big.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, W, H)
    const vp = page.getViewport({ scale: SCALE, offsetX: -rx0 * SCALE, offsetY: -ry0 * SCALE })
    await page.render({ canvasContext: ctx, viewport: vp }).promise
    const d = ctx.getImageData(0, 0, W, H).data
    const rowDark = (y: number, xa = 0, xb = W) => { let n = 0; for (let x = xa; x < xb; x++) if (isDark(d, (y * W + x) * 4)) n++; return n }
    // 縦線は4行おきに見れば十分（速くするため）
    const colDark = (x: number, ya: number, yb: number) => { let n = 0; for (let y = ya; y < yb; y += 4) if (isDark(d, (y * W + x) * 4)) n += 4; return n }

    // 下の枠線：下から見て、横いっぱいに黒い行
    let bottom = H - 1
    while (bottom > 0 && rowDark(bottom) < W * 0.6) bottom--
    const titleY = Math.round((t.top - ry0) * SCALE)
    const tableTopGuess = Math.round((t.base + 20 - ry0) * SCALE)
    // 左右の枠線：縦に長く黒い列
    let left = 0
    while (left < W / 2 && colDark(left, tableTopGuess, bottom) < (bottom - tableTopGuess) * 0.8) left++
    let right = W - 1
    while (right > W / 2 && colDark(right, tableTopGuess, bottom) < (bottom - tableTopGuess) * 0.8) right--
    // 上：タイトルの上の白いところまで。上の明細のメモ書きがあれば、その下で止める
    let top = titleY
    const limit = Math.max(0, titleY - 5 * SCALE)
    while (top > limit && rowDark(top - 1, left, right + 1) === 0) top--

    const pad = 3 * SCALE
    const cw = right - left + 1 + pad * 2
    const ch = bottom - top + 1 + Math.round(pad * 0.6)
    const c = document.createElement('canvas')
    c.width = cw
    c.height = ch + Math.round(pad * 0.6)
    const cc = c.getContext('2d')!
    cc.fillStyle = '#fff'
    cc.fillRect(0, 0, c.width, c.height)
    cc.drawImage(big, left, top, right - left + 1, bottom - top + 1, pad, Math.round(pad * 0.6), right - left + 1, bottom - top + 1)
    out.push({ name, month, year, canvas: c })
  }
  return out
}

const thisMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function MeisaiAdmin() {
  const [pin, setPin] = useState('')
  const [authed, setAuthed] = useState(false)
  const [authError, setAuthError] = useState('')
  const [staff, setStaff] = useState<string[]>([])
  const [saved, setSaved] = useState<string[]>([])
  const [month, setMonth] = useState(thisMonth())
  const [cuts, setCuts] = useState<Cut[]>([])
  const [busy, setBusy] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const ownerPin = () => sessionStorage.getItem('meisaiOwnerPin') ?? ''

  const refreshSaved = useCallback(async (m: string, p = ownerPin()) => {
    const res = await fetch(`/api/meisai/upload?month=${m}`, { headers: { 'x-owner-pin': p }, cache: 'no-store' })
    if (!res.ok) return false
    const d = await res.json()
    setStaff(d.names)
    setSaved(d.saved)
    return true
  }, [])

  useEffect(() => {
    const p = sessionStorage.getItem('meisaiOwnerPin')
    if (p) refreshSaved(month, p).then(ok => setAuthed(ok))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (authed) refreshSaved(month)
  }, [authed, month, refreshSaved])

  const login = async () => {
    setAuthError('')
    const ok = await refreshSaved(month, pin)
    if (ok) {
      sessionStorage.setItem('meisaiOwnerPin', pin)
      setAuthed(true)
    } else setAuthError('PINがちがいます（給料計算アプリと同じPIN）')
  }

  const readPdf = async (file: File) => {
    setBusy('PDFを読んでいます…')
    setCuts([])
    try {
      const pdfjs = await loadPdfJs()
      const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
      const all: Cut[] = []
      const monthCount: Record<string, number> = {}
      let year = ''
      for (let p = 1; p <= doc.numPages; p++) {
        setBusy(`切り取っています…（${p}/${doc.numPages}ページ）`)
        const slips = await cutPage(await doc.getPage(p))
        for (const s of slips) {
          if (s.month) monthCount[s.month] = (monthCount[s.month] ?? 0) + 1
          if (s.year) year = s.year
          all.push({
            id: all.length,
            pdfName: s.name,
            staff: staff.includes(s.name) ? s.name : '',
            monthOnSlip: s.month,
            dataUrl: s.canvas.toDataURL('image/png'),
            status: 'ready',
          })
        }
      }
      // いちばん多い「○月分」をこのPDFの月にする（年は令和→西暦）
      const top = Object.entries(monthCount).sort((a, b) => b[1] - a[1])[0]?.[0]
      if (top) {
        const y = year ? 2018 + Number(year) : new Date().getFullYear()
        setMonth(`${y}-${top.padStart(2, '0')}`)
      }
      setCuts(all)
      if (all.length === 0) setBusy('明細が見つかりませんでした。「給料明細 公式」のPDFか確かめてください')
      else setBusy('')
    } catch (e) {
      setBusy((e as Error).message || '読み込めませんでした')
    }
  }

  const saveAll = async () => {
    const targets = cuts.filter(c => c.staff && c.status !== 'saved')
    const overwrite = targets.filter(c => saved.includes(c.staff)).map(c => c.staff)
    const msg = `${monthLabel(month)}として ${targets.length}人分を入れます。` +
      (overwrite.length ? `\n\n${overwrite.join('・')} さんはもう入っているので、新しいほうに入れ替えます（古いほうはNotionのごみ箱に残ります）。` : '') +
      '\n\nよろしいですか？'
    if (!targets.length || !confirm(msg)) return
    for (const c of targets) {
      setCuts(prev => prev.map(x => (x.id === c.id ? { ...x, status: 'saving' } : x)))
      try {
        const res = await fetch('/api/meisai/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-owner-pin': ownerPin() },
          body: JSON.stringify({ name: c.staff, month, png: c.dataUrl }),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error)
        setCuts(prev => prev.map(x => (x.id === c.id ? { ...x, status: 'saved' } : x)))
      } catch (e) {
        setCuts(prev => prev.map(x => (x.id === c.id ? { ...x, status: 'error', message: (e as Error).message || '保存できませんでした' } : x)))
      }
    }
    refreshSaved(month)
  }

  if (!authed) {
    return (
      <main className="mx-auto max-w-sm px-4 pt-20">
        <h1 className="text-center text-xl font-bold">給与明細を入れる（徹さん用）</h1>
        <input
          type="password"
          value={pin}
          onChange={e => setPin(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && login()}
          placeholder="給料計算アプリのPIN"
          className="mt-6 w-full rounded-lg border border-stone-300 px-4 py-3"
        />
        <button onClick={login} className="mt-3 w-full rounded-lg bg-stone-800 py-3 font-semibold text-white">入る</button>
        {authError && <p className="mt-3 text-center text-sm text-red-700">{authError}</p>}
      </main>
    )
  }

  const toSave = cuts.filter(c => c.staff && c.status !== 'saved').length
  const usedNames = cuts.map(c => c.staff).filter(Boolean)

  return (
    <main className="mx-auto max-w-6xl px-6 pb-20">
      <header className="flex flex-wrap items-end justify-between gap-4 pt-8 pb-6">
        <div>
          <p className="text-xs tracking-[0.3em] text-stone-500">蕎麦庵sio</p>
          <h1 className="text-2xl font-bold">給与明細を入れる</h1>
        </div>
        <a href="/meisai" target="_blank" className="text-sm text-stone-600 underline">スタッフが見る画面を開く</a>
      </header>

      <label
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault()
          setDragOver(false)
          const f = e.dataTransfer.files[0]
          if (f) readPdf(f)
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${dragOver ? 'border-stone-800 bg-white' : 'border-stone-300 bg-white/60'}`}
      >
        <span className="text-lg font-semibold">「給料明細 公式」のPDFをここに落とす</span>
        <span className="mt-1 text-sm text-stone-500">またはクリックしてえらぶ。1人ずつ自動で切り取ります</span>
        <input type="file" accept="application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) readPdf(f); e.target.value = '' }} />
      </label>
      {busy && <p className="mt-4 text-center text-stone-600">{busy}</p>}

      <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl bg-white p-4 shadow-sm">
        <label className="flex items-center gap-2">
          <span className="text-sm text-stone-600">何月分として入れる？</span>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="rounded-lg border border-stone-300 px-3 py-2" />
        </label>
        <p className="text-sm text-stone-600">
          この月にもう入っている人：{saved.length ? saved.join('・') : 'まだいません'}
        </p>
        {cuts.length > 0 && (
          <button
            onClick={saveAll}
            disabled={!toSave}
            className="ml-auto rounded-full bg-stone-800 px-6 py-3 font-semibold text-white disabled:opacity-40"
          >
            {toSave ? `${toSave}人分をアプリに入れる` : 'ぜんぶ入れました'}
          </button>
        )}
      </div>

      {cuts.length > 0 && (
        <p className="mt-4 text-sm text-stone-600">
          名前が「入れない」になっている明細は保存しません（徹さんの分など）。名前がちがうときは下でえらび直せます。
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
        {cuts.map(c => {
          const dup = c.staff && usedNames.filter(n => n === c.staff).length > 1
          const monthDiff = c.monthOnSlip && Number(c.monthOnSlip) !== Number(month.split('-')[1])
          return (
            <div key={c.id} className={`rounded-xl bg-white p-2 shadow-sm ${c.staff ? '' : 'opacity-50'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.dataUrl} alt={c.pdfName} className="w-full border border-stone-100" />
              <select
                value={c.staff}
                onChange={e => setCuts(prev => prev.map(x => (x.id === c.id ? { ...x, staff: e.target.value, status: 'ready' } : x)))}
                className="mt-2 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
              >
                <option value="">入れない（{c.pdfName || '名前なし'}）</option>
                {staff.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <p className="mt-1 min-h-[1.25rem] text-xs">
                {c.status === 'saving' && <span className="text-stone-500">保存中…</span>}
                {c.status === 'saved' && <span className="font-semibold text-green-700">入れました</span>}
                {c.status === 'error' && <span className="text-red-700">{c.message}</span>}
                {c.status === 'ready' && dup && <span className="text-red-700">同じ名前が2つあります</span>}
                {c.status === 'ready' && !dup && c.staff && monthDiff && <span className="text-amber-700">明細には「{c.monthOnSlip}月分」と書いてあります</span>}
              </p>
            </div>
          )
        })}
      </div>
    </main>
  )
}

function monthLabel(m: string) {
  const [y, mo] = m.split('-')
  return `${y}年${Number(mo)}月分`
}
