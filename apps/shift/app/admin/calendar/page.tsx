'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { StaffMember, AppSettings, ShiftSubmission } from '@/lib/types'
import { getHourlyRate } from '@/lib/salary'

const DAYS_JA = ['日', '月', '火', '水', '木', '金', '土']

const SHIFT_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  '昼':  { bg: 'bg-yellow-400', text: 'text-white', label: '昼' },
  '夜':  { bg: 'bg-indigo-500', text: 'text-white', label: '夜' },
  '1日': { bg: 'bg-green-500',  text: 'text-white', label: '1日' },
  '×':   { bg: 'bg-gray-200',   text: 'text-gray-400', label: '×' },
}

// シフト種別ごとのデフォルト労働時間（時）
const SHIFT_DEFAULT_HOURS: Record<string, number> = { '昼': 4, '夜': 5, '1日': 9 }

// "HH:MM〜HH:MM" → 労働時間（時）
function parseTimeRange(timeStr: string): number | null {
  if (!timeStr || !timeStr.includes('〜')) return null
  const [start, end] = timeStr.split('〜')
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  if (isNaN(sh) || isNaN(eh)) return null
  const mins = (eh * 60 + em) - (sh * 60 + sm)
  return mins > 0 ? mins / 60 : null
}

// スタッフ1人分の概算人件費
function estimateCost(
  name: string,
  shifts: Record<string, { type: string | null; time: string }>,
  days: Date[]
): number {
  const rate = getHourlyRate(name)
  let total = 0
  for (const d of days) {
    const key = dateKey(d)
    const s = shifts[key]
    if (!s?.type || s.type === '×') continue
    const hours = parseTimeRange(s.time) ?? SHIFT_DEFAULT_HOURS[s.type] ?? 0
    const isWknd = d.getDay() === 0 || d.getDay() === 6
    total += hours * (isWknd ? rate.holiday : rate.weekday)
  }
  return Math.floor(total)
}

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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 日本の祝日（簡易版）
const HOLIDAYS_2025_2026 = new Set([
  '2025-01-01','2025-01-13','2025-02-11','2025-02-23','2025-02-24',
  '2025-03-20','2025-04-29','2025-05-03','2025-05-04','2025-05-05',
  '2025-05-06','2025-07-21','2025-08-11','2025-09-15','2025-09-23',
  '2025-10-13','2025-11-03','2025-11-23','2025-11-24',
  '2026-01-01','2026-01-12','2026-02-11','2026-02-23','2026-03-20',
  '2026-04-29','2026-05-03','2026-05-04','2026-05-05','2026-05-06',
  '2026-07-20','2026-08-11','2026-08-13','2026-08-14','2026-09-21','2026-09-22','2026-09-23',
  '2026-10-12','2026-11-03','2026-11-23',
])

function isHolidayDate(d: Date): boolean {
  const dow = d.getDay()
  if (dow === 0 || dow === 6) return true
  return HOLIDAYS_2025_2026.has(dateKey(d))
}

// 出勤数カウント（×以外）
function countWork(shifts: Record<string, { type: string | null }>, days: Date[]): number {
  return days.filter(d => {
    const s = shifts[dateKey(d)]
    return s?.type && s.type !== '×'
  }).length
}

export default function CalendarPage() {
  const router = useRouter()
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [submissions, setSubmissions] = useState<ShiftSubmission[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [staffData, settingsData] = await Promise.all([
        fetch('/api/staff').then(r => r.json()),
        fetch('/api/settings').then(r => r.json()) as Promise<AppSettings>,
      ])
      setStaff(staffData)
      setSettings(settingsData)
      const subs = await fetch(`/api/shifts?period=${settingsData.period}`).then(r => r.json())
      setSubmissions(Array.isArray(subs) ? subs : [])
      setLoading(false)
    }
    load()
  }, [])

  const days = settings ? getDaysInMonth(settings.period) : []
  const [year, month] = (settings?.period ?? '').split('-').map(Number)

  // スタッフ名 → shifts のマップ
  const shiftMap: Record<string, Record<string, { type: string | null; time: string }>> = {}
  submissions.forEach(s => { shiftMap[s.staff] = s.shifts })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-gray-800 text-white px-4 py-4 flex items-center gap-3 shadow-lg">
        <button
          onClick={() => router.push('/admin')}
          className="text-gray-400 text-sm border border-gray-600 rounded-xl px-3 py-1.5 active:bg-gray-700"
        >
          ← 戻る
        </button>
        <div>
          <h1 className="font-bold text-lg">シフト表</h1>
          {settings && (
            <p className="text-gray-400 text-xs mt-0.5">{year}年{month}月分</p>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-orange-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="p-3">

          {/* 人件費概算カード */}
          {(() => {
            const totalCost = staff.reduce((sum, s) => {
              const shifts = shiftMap[s.name]
              if (!shifts) return sum
              return sum + estimateCost(s.name, shifts, days)
            }, 0)
            const submittedCount = submissions.length
            return (
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm">
                  <p className="text-xs text-gray-400">概算人件費合計</p>
                  <p className="text-xl font-bold text-orange-500 mt-0.5">
                    ¥{totalCost.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{submittedCount}/{staff.length}人提出</p>
                </div>
                <div className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm">
                  <p className="text-xs text-gray-400">目安</p>
                  <div className="mt-1 space-y-0.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">昼</span><span className="text-gray-600">4h換算</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">夜</span><span className="text-gray-600">5h換算</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">1日</span><span className="text-gray-600">9h換算</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* 凡例 */}
          <div className="flex gap-2 flex-wrap mb-3">
            {Object.entries(SHIFT_STYLE).filter(([k]) => k !== '×').map(([k, v]) => (
              <span key={k} className={`text-xs px-3 py-1 rounded-full font-medium ${v.bg} ${v.text}`}>
                {v.label}
              </span>
            ))}
            <span className="text-xs px-3 py-1 rounded-full font-medium bg-gray-200 text-gray-400">×</span>
            <span className="text-xs px-3 py-1 rounded-full font-medium bg-orange-100 text-orange-600">土日祝</span>
          </div>

          {/* テーブル */}
          <div className="overflow-x-auto rounded-2xl shadow-sm border border-gray-100 bg-white">
            <table className="text-xs border-collapse" style={{ minWidth: `${60 + staff.length * 52}px` }}>
              <thead>
                {/* スタッフ名ヘッダー */}
                <tr className="bg-gray-800 text-white">
                  <th className="sticky left-0 z-10 bg-gray-800 px-2 py-2.5 text-left font-medium min-w-[60px]">
                    日付
                  </th>
                  {staff.map(s => (
                    <th key={s.id} className="px-1 py-2.5 font-medium text-center min-w-[48px]">
                      <div className="leading-tight">{s.name.replace(/　/g, '\n').split('\n')[0]}</div>
                    </th>
                  ))}
                </tr>
                {/* 出勤日数行 */}
                <tr className="bg-gray-700 text-gray-300">
                  <td className="sticky left-0 z-10 bg-gray-700 px-2 py-1.5 text-gray-400 text-center text-xs">
                    出勤日数
                  </td>
                  {staff.map(s => {
                    const shifts = shiftMap[s.name] ?? {}
                    const count = countWork(shifts, days)
                    return (
                      <td key={s.id} className="px-1 py-1.5 text-center font-bold">
                        {shiftMap[s.name] !== undefined ? (
                          <span className="text-orange-300">{count}日</span>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
                {/* 概算人件費行 */}
                <tr className="bg-gray-700 text-gray-300 border-t border-gray-600">
                  <td className="sticky left-0 z-10 bg-gray-700 px-2 py-1.5 text-gray-400 text-center text-xs">
                    概算
                  </td>
                  {staff.map(s => {
                    const shifts = shiftMap[s.name]
                    const cost = shifts ? estimateCost(s.name, shifts, days) : null
                    return (
                      <td key={s.id} className="px-1 py-1.5 text-center">
                        {cost !== null ? (
                          <span className="text-yellow-300 text-xs font-medium">
                            {cost >= 10000 ? `${Math.floor(cost / 10000)}万` : `${cost.toLocaleString()}`}
                          </span>
                        ) : (
                          <span className="text-gray-500 text-xs">—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {days.map(date => {
                  const key = dateKey(date)
                  const dow = date.getDay()
                  const isSun = dow === 0
                  const isSat = dow === 6
                  const isHol = isHolidayDate(date)
                  const rowBg = isHol ? 'bg-orange-50' : ''

                  return (
                    <tr key={key} className={`border-t border-gray-100 ${rowBg}`}>
                      {/* 日付列 */}
                      <td className={`sticky left-0 z-10 px-2 py-2 font-medium whitespace-nowrap ${rowBg || 'bg-white'}`}>
                        <span className={`${isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-gray-700'}`}>
                          {date.getDate()}<span className="text-xs font-normal ml-0.5">({DAYS_JA[dow]})</span>
                        </span>
                      </td>

                      {/* 各スタッフのシフト */}
                      {staff.map(s => {
                        const submitted = shiftMap[s.name] !== undefined
                        const shift = shiftMap[s.name]?.[key]
                        const type = shift?.type ?? null

                        return (
                          <td key={s.id} className="px-1 py-1.5 text-center">
                            {!submitted ? (
                              <span className="text-gray-300 text-xs">—</span>
                            ) : type && SHIFT_STYLE[type] ? (
                              <span className={`inline-block px-1.5 py-0.5 rounded-lg font-bold text-xs ${SHIFT_STYLE[type].bg} ${SHIFT_STYLE[type].text}`}>
                                {SHIFT_STYLE[type].label}
                              </span>
                            ) : (
                              <span className="text-gray-200 text-xs">·</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* 未提出スタッフ表示 */}
          {(() => {
            const submitted = new Set(submissions.map(s => s.staff))
            const unsubmitted = staff.filter(s => !submitted.has(s.name))
            if (unsubmitted.length === 0) return null
            return (
              <div className="mt-3 bg-red-50 border border-red-100 rounded-2xl p-3">
                <p className="text-xs text-red-600 font-medium mb-1">未提出</p>
                <div className="flex flex-wrap gap-1.5">
                  {unsubmitted.map(s => (
                    <span key={s.id} className="text-xs bg-red-100 text-red-600 px-2.5 py-1 rounded-full">
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
