'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ShiftType, MonthShifts, AppSettings, Notification } from '@/lib/types'

const SHIFT_OPTIONS: { type: ShiftType; label: string; active: string; inactive: string }[] = [
  { type: '昼',  label: '昼',  active: 'bg-yellow-400 text-white border-yellow-400', inactive: 'bg-gray-50 text-gray-400 border-gray-200' },
  { type: '夜',  label: '夜',  active: 'bg-indigo-500 text-white border-indigo-500', inactive: 'bg-gray-50 text-gray-400 border-gray-200' },
  { type: '1日', label: '1日', active: 'bg-green-500 text-white border-green-500',   inactive: 'bg-gray-50 text-gray-400 border-gray-200' },
  { type: '×',  label: '×',  active: 'bg-red-400 text-white border-red-400',        inactive: 'bg-gray-50 text-gray-400 border-gray-200' },
]

const DAYS = ['日', '月', '火', '水', '木', '金', '土']

function getDaysInMonth(period: string): Date[] {
  const [y, m] = period.split('-').map(Number)
  const days: Date[] = []
  const d = new Date(y, m - 1, 1)
  while (d.getMonth() === m - 1) {
    days.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return days
}

function dateKey(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function StaffPage({ params }: { params: { name: string } }) {
  const { name } = params
  const staffName = decodeURIComponent(name)
  const router = useRouter()

  const [pinVerified, setPinVerified] = useState(false)
  const [pinRequired, setPinRequired] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState(false)
  const [pinChecking, setPinChecking] = useState(false)
  const [initializing, setInitializing] = useState(true)

  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [shifts, setShifts] = useState<MonthShifts>({})
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)

  // PIN確認
  useEffect(() => {
    const sessionKey = `pinVerified_${staffName}`
    if (sessionStorage.getItem(sessionKey) === '1') {
      setPinVerified(true)
      setInitializing(false)
      return
    }
    fetch('/api/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: staffName, pin: '' }),
    })
      .then(r => r.json())
      .then(({ valid }) => {
        if (valid) {
          // PIN未設定 → 自由アクセス
          sessionStorage.setItem(sessionKey, '1')
          setPinVerified(true)
        } else {
          setPinRequired(true)
        }
        setInitializing(false)
      })
  }, [staffName])

  // シフトデータ読み込み
  useEffect(() => {
    if (!pinVerified) return
    const load = async () => {
      setLoading(true)
      const [settingsData, notifData] = await Promise.all([
        fetch('/api/settings').then(r => r.json()) as Promise<AppSettings>,
        fetch(`/api/notifications?staff=${encodeURIComponent(staffName)}`).then(r => r.json()),
      ])
      setSettings(settingsData)
      setNotifications(notifData)

      const existing = await fetch(
        `/api/shifts?staff=${encodeURIComponent(staffName)}&period=${settingsData.period}`
      ).then(r => r.json())

      if (existing?.shifts) {
        setShifts(existing.shifts)
        setAlreadySubmitted(true)
      }

      fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff: staffName }),
      })
      setLoading(false)
    }
    load()
  }, [pinVerified, staffName])

  const handlePinSubmit = async () => {
    if (pinInput.length !== 4) return
    setPinChecking(true)
    setPinError(false)
    try {
      const res = await fetch('/api/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: staffName, pin: pinInput }),
      })
      const { valid } = await res.json()
      if (valid) {
        sessionStorage.setItem(`pinVerified_${staffName}`, '1')
        setPinVerified(true)
        setPinRequired(false)
      } else {
        setPinError(true)
        setPinInput('')
      }
    } finally {
      setPinChecking(false)
    }
  }

  const toggleShiftType = (key: string, type: ShiftType) => {
    setShifts(prev => ({
      ...prev,
      [key]: {
        type: prev[key]?.type === type ? null : type,
        time: prev[key]?.time ?? '',
      },
    }))
  }

  const setTime = (key: string, time: string) => {
    setShifts(prev => ({
      ...prev,
      [key]: { type: prev[key]?.type ?? null, time },
    }))
  }

  const handleSubmit = async () => {
    if (!settings) return
    setSaving(true)
    try {
      await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff: staffName, period: settings.period, shifts }),
      })
      setAlreadySubmitted(true)
      setSavedMsg(true)
      setTimeout(() => setSavedMsg(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  // 初期化中
  if (initializing) {
    return (
      <div className="min-h-screen bg-orange-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // PIN入力画面
  if (pinRequired && !pinVerified) {
    return (
      <div className="min-h-screen bg-orange-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 w-full max-w-xs shadow-2xl">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">🔒</div>
            <h1 className="text-xl font-bold text-gray-800">{staffName}</h1>
            <p className="text-gray-400 text-sm mt-1">PINコードを入力してください</p>
          </div>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            placeholder="• • • •"
            value={pinInput}
            onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
            onKeyDown={e => e.key === 'Enter' && handlePinSubmit()}
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-center text-2xl tracking-[0.5em] focus:outline-none focus:border-orange-400"
            autoFocus
          />
          {pinError && (
            <p className="text-red-500 text-sm text-center mt-2">PINが正しくありません</p>
          )}
          <button
            onClick={handlePinSubmit}
            disabled={pinInput.length !== 4 || pinChecking}
            className="w-full bg-orange-500 text-white py-3 rounded-2xl font-bold mt-4 active:bg-orange-600 disabled:opacity-50"
          >
            {pinChecking ? '確認中...' : '確認'}
          </button>
          <button
            onClick={() => router.push('/')}
            className="w-full text-gray-400 text-sm mt-3 py-2"
          >
            ← 戻る
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-orange-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const [year, month] = (settings?.period ?? '').split('-').map(Number)
  const days = settings ? getDaysInMonth(settings.period) : []

  const deadlineText = (() => {
    if (!settings?.deadline) return null
    const d = new Date(settings.deadline)
    return `${d.getMonth() + 1}月${d.getDate()}日`
  })()

  const submittedCount = Object.values(shifts).filter(s => s.type !== null).length

  return (
    <div className="min-h-screen bg-orange-50 pb-28">
      {/* ヘッダー */}
      <div className="bg-orange-500 text-white px-4 py-4 flex items-center gap-3 shadow-md">
        <button
          onClick={() => router.push('/')}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-orange-400 active:bg-orange-600 text-lg"
        >
          ←
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">{staffName}</h1>
          <p className="text-orange-100 text-xs">{year}年{month}月分 シフト希望</p>
        </div>
        <div className={`text-xs px-3 py-1 rounded-full font-medium ${
          alreadySubmitted ? 'bg-green-400 text-white' : 'bg-orange-400 text-orange-100'
        }`}>
          {alreadySubmitted ? '✓ 提出済み' : '未提出'}
        </div>
      </div>

      {/* 通知バナー */}
      {notifications.length > 0 && (
        <div className="mx-4 mt-3 space-y-2">
          {notifications.map(n => (
            <div key={n.id} className="bg-red-50 border border-red-200 rounded-2xl p-3 flex gap-2 text-sm text-red-700">
              <span className="flex-shrink-0">🔔</span>
              <span>{n.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* 締切・提出数 */}
      <div className="mx-4 mt-3 grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl p-3 text-center border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-400">締切日</p>
          <p className="font-bold text-gray-700 text-sm mt-0.5">{deadlineText ?? '未設定'}</p>
        </div>
        <div className="bg-white rounded-2xl p-3 text-center border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-400">入力済み</p>
          <p className="font-bold text-gray-700 text-sm mt-0.5">{submittedCount} / {days.length} 日</p>
        </div>
      </div>

      {/* 凡例 */}
      <div className="mx-4 mt-3 flex gap-2 flex-wrap">
        {SHIFT_OPTIONS.map(o => (
          <span key={o.type as string} className={`text-xs px-2.5 py-1 rounded-full border font-medium ${o.active}`}>
            {o.label}
          </span>
        ))}
        <span className="text-xs text-gray-400 self-center">← タップして選択</span>
      </div>

      {/* カレンダー */}
      <div className="mx-4 mt-3 space-y-2">
        {days.map(date => {
          const key = dateKey(date)
          const dow = date.getDay()
          const isSun = dow === 0
          const isSat = dow === 6
          const dayShift = shifts[key]
          const selected = dayShift?.type ?? null

          return (
            <div
              key={key}
              className={`bg-white rounded-2xl p-3 shadow-sm border ${
                isSun ? 'border-red-100' : isSat ? 'border-blue-100' : 'border-gray-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="w-14 flex-shrink-0 flex items-baseline gap-1">
                  <span className="text-xl font-bold text-gray-800">{date.getDate()}</span>
                  <span className={`text-xs font-medium ${isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-gray-400'}`}>
                    {DAYS[dow]}
                  </span>
                </div>
                <div className="flex gap-1.5 flex-1">
                  {SHIFT_OPTIONS.map(opt => (
                    <button
                      key={opt.type as string}
                      onClick={() => toggleShiftType(key, opt.type)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all active:scale-95 ${
                        selected === opt.type ? opt.active : opt.inactive
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {selected && selected !== '×' && (
                <div className="mt-2 pl-16">
                  <input
                    type="text"
                    inputMode="text"
                    placeholder="希望時間（例: 11:00〜15:00）"
                    value={dayShift?.time ?? ''}
                    onChange={e => setTime(key, e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 focus:outline-none focus:border-orange-300 text-gray-600 placeholder-gray-300"
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 提出ボタン（固定） */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 shadow-xl">
        {savedMsg && (
          <div className="text-center text-green-600 text-sm font-medium mb-2">
            ✓ 提出しました！お疲れ様です。
          </div>
        )}
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full bg-orange-500 text-white py-4 rounded-2xl font-bold text-lg shadow-md active:bg-orange-600 disabled:opacity-60 transition-colors"
        >
          {saving ? '送信中...' : alreadySubmitted ? '更新する' : 'シフトを提出する'}
        </button>
      </div>
    </div>
  )
}
