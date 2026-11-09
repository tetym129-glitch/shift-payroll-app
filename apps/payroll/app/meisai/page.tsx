'use client'

import { useEffect, useRef, useState } from 'react'

type Slip = { month: string; url: string | null; file?: File; error?: string }

const monthLabel = (m: string) => {
  const [y, mo] = m.split('-')
  return `${y}年 ${Number(mo)}月分`
}

export default function MeisaiPage() {
  const [names, setNames] = useState<string[]>([])
  const [loadError, setLoadError] = useState('')
  const [name, setName] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [checking, setChecking] = useState(false)
  const [pinError, setPinError] = useState('')
  const [slips, setSlips] = useState<Slip[] | null>(null)
  const [viewer, setViewer] = useState<Slip | null>(null)
  const [notice, setNotice] = useState('')
  const pinRef = useRef<HTMLInputElement>(null)

  // LINEの中のブラウザは保存ができないことが多いので、スマホの普通のブラウザ（Safari/Chrome）で開き直す
  useEffect(() => {
    const url = new URL(window.location.href)
    if (/ Line\//i.test(navigator.userAgent) && url.searchParams.get('openExternalBrowser') !== '1') {
      url.searchParams.set('openExternalBrowser', '1')
      window.location.replace(url.toString())
    }
  }, [])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 9000)
    return () => clearTimeout(t)
  }, [notice])

  useEffect(() => {
    fetch('/api/meisai/staff', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => (d.names ? setNames(d.names) : setLoadError(d.error ?? '読み込めませんでした')))
      .catch(() => setLoadError('うまくつながりませんでした。少ししてから開き直してください'))
  }, [])

  useEffect(() => {
    if (name && !slips) setTimeout(() => pinRef.current?.focus(), 50)
  }, [name, slips])

  // 開いている画像のURLを、戻るときに片付ける
  useEffect(() => () => slips?.forEach(s => s.url && URL.revokeObjectURL(s.url)), [slips])

  const choose = (n: string) => {
    setName(n)
    setPin('')
    setPinError('')
    setSlips(null)
  }

  const back = () => {
    setViewer(null)
    setNotice('')
    setName(null)
    setPin('')
    setPinError('')
    setSlips(null)
  }

  const login = async (value: string) => {
    if (!name || value.length !== 4 || checking) return
    setChecking(true)
    setPinError('')
    try {
      const res = await fetch('/api/meisai/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, pin: value }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPinError(data.error ?? 'パスワードがちがいます')
        setPin('')
        return
      }
      const months: string[] = data.months
      setSlips(months.map(m => ({ month: m, url: null })))
      // 新しい月から順に画像を読む
      for (const m of months) {
        try {
          const r = await fetch('/api/meisai/image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, pin: value, month: m }),
          })
          if (!r.ok) throw new Error()
          const blob = await r.blob()
          const url = URL.createObjectURL(blob)
          // 保存ボタンを押したその場で共有メニューを出せるよう、先にファイルにしておく
          const file = new File([blob], `給与明細_${m}_${name}.png`, { type: 'image/png' })
          setSlips(prev => prev?.map(s => (s.month === m ? { ...s, url, file } : s)) ?? prev)
        } catch {
          setSlips(prev => prev?.map(s => (s.month === m ? { ...s, error: '読み込めませんでした' } : s)) ?? prev)
        }
      }
    } catch {
      setPinError('うまくつながりませんでした。もう一度ためしてください')
      setPin('')
    } finally {
      setChecking(false)
    }
  }

  // 機種ごとに保存のしかたを変える
  // - iPhone/iPad：共有メニューの「画像を保存」で写真に入る。「押したその場」で呼ばないと何も起きないので待ち時間を入れない
  // - Android：共有メニューに「保存」がないので、サーバーから「ダウンロード」として受け取る（ギャラリー/ファイルのDownloadに入る）
  // - Mac/パソコン：そのままダウンロード
  const save = (s: Slip) => {
    if (!s.url || !s.file || !name) return
    const ua = navigator.userAgent
    const isAndroid = /Android/i.test(ua)
    const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
    if (isIOS) {
      if (navigator.canShare?.({ files: [s.file] })) {
        navigator.share({ files: [s.file] }).catch(e => {
          if ((e as Error).name !== 'AbortError') setViewer(s)
        })
      } else {
        setViewer(s) // 共有できないときは、大きく出して長押しで保存してもらう
      }
      return
    }
    if (isAndroid) {
      // 画面の外に小さなフォームを作って送る（ブラウザが普通のダウンロードとして受け取る）
      const form = document.createElement('form')
      form.method = 'POST'
      form.action = '/api/meisai/image'
      form.style.display = 'none'
      const fields: Record<string, string> = { name, pin, month: s.month, download: '1' }
      for (const [k, v] of Object.entries(fields)) {
        const input = document.createElement('input')
        input.type = 'hidden'
        input.name = k
        input.value = v
        form.appendChild(input)
      }
      document.body.appendChild(form)
      form.submit()
      form.remove()
      setNotice('ダウンロードしました。「ファイル」や「ギャラリー（フォト）」のダウンロードに入っています。見つからないときは、画像を長押しして「画像をダウンロード」を押してください')
      return
    }
    const a = document.createElement('a')
    a.href = s.url
    a.download = s.file.name
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  // ---- 画面 ----

  const header = (
    <header className="pt-8 pb-5 text-center">
      <p className="text-xs tracking-[0.3em] text-stone-500">蕎麦庵sio</p>
      <h1 className="mt-1 text-2xl font-bold tracking-wider">給与明細</h1>
    </header>
  )

  if (!name) {
    return (
      <main className="mx-auto max-w-md px-4 pb-12">
        {header}
        <p className="mb-4 text-center text-sm text-stone-600">自分の名前を押してください</p>
        {loadError && <p className="rounded-lg bg-red-50 p-4 text-center text-sm text-red-700">{loadError}</p>}
        {!loadError && names.length === 0 && <p className="text-center text-sm text-stone-500">読み込み中…</p>}
        <div className="grid grid-cols-2 gap-3">
          {names.map(n => (
            <button
              key={n}
              onClick={() => choose(n)}
              className="rounded-2xl border border-stone-200 bg-white py-5 text-lg font-semibold shadow-sm active:scale-[0.97] active:bg-stone-100"
            >
              {n}
            </button>
          ))}
        </div>
      </main>
    )
  }

  if (!slips) {
    return (
      <main className="mx-auto max-w-md px-4 pb-12">
        {header}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-center text-lg font-semibold">{name} さん</p>
          <p className="mt-1 text-center text-sm text-stone-600">シフト希望アプリと同じ4けたのパスワード</p>
          <input
            ref={pinRef}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]*"
            maxLength={4}
            value={pin}
            disabled={checking}
            onChange={e => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 4)
              setPin(v)
              setPinError('')
              if (v.length === 4) login(v)
            }}
            className="mt-5 w-full rounded-xl border border-stone-300 bg-stone-50 py-4 text-center text-3xl tracking-[0.6em] focus:border-stone-600 focus:outline-none"
            aria-label="パスワード"
          />
          <div className="mt-3 flex justify-center gap-3">
            {[0, 1, 2, 3].map(i => (
              <span key={i} className={`h-3 w-3 rounded-full ${i < pin.length ? 'bg-stone-800' : 'bg-stone-200'}`} />
            ))}
          </div>
          {checking && <p className="mt-4 text-center text-sm text-stone-500">確かめています…</p>}
          {pinError && <p className="mt-4 rounded-lg bg-red-50 p-3 text-center text-sm text-red-700">{pinError}</p>}
        </div>
        <button onClick={back} className="mt-6 w-full py-3 text-sm text-stone-500 underline">名前をえらび直す</button>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-md px-4 pb-16">
      {header}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-lg font-semibold">{name} さんの明細</p>
        <button onClick={back} className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm">とじる</button>
      </div>
      {slips.length === 0 && (
        <p className="rounded-2xl bg-white p-6 text-center text-sm text-stone-600 shadow-sm">まだ明細が入っていません</p>
      )}
      <div className="space-y-6">
        {slips.map(s => (
          <section key={s.month} className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
              <h2 className="font-semibold">{monthLabel(s.month)}</h2>
              <button
                onClick={() => save(s)}
                disabled={!s.file}
                className="rounded-full bg-stone-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 active:scale-[0.97]"
              >
                画像を保存
              </button>
            </div>
            <div className="p-3">
              {s.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.url} alt={`${monthLabel(s.month)}の給与明細`} className="mx-auto w-full max-w-sm" />
              ) : (
                <p className="py-16 text-center text-sm text-stone-500">{s.error ?? '読み込み中…'}</p>
              )}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-8 text-center text-xs text-stone-500">画像を長押ししても保存できます</p>
      {notice && (
        <div className="fixed inset-x-3 bottom-4 z-40 rounded-2xl bg-stone-800 p-4 text-sm leading-relaxed text-white shadow-lg" onClick={() => setNotice('')}>
          {notice}
        </div>
      )}
      {viewer?.url && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={() => setViewer(null)}>
          <p className="px-4 pt-6 text-center text-sm text-white">画像を<b>長押し</b>して「写真に保存」を押してください</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewer.url} alt="給与明細" className="mx-auto mt-4 max-h-[78vh] w-auto max-w-full bg-white" onClick={e => e.stopPropagation()} />
          <button className="mx-auto mt-4 rounded-full bg-white px-6 py-2 text-sm font-semibold">とじる</button>
        </div>
      )}
    </main>
  )
}
