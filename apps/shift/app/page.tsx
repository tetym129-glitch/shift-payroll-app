'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { StaffMember, AppSettings } from '@/lib/types'

export default function HomePage() {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/staff').then(r => r.json()),
      fetch('/api/settings').then(r => r.json()),
      fetch('/api/notifications?counts=1').then(r => r.json()),
    ]).then(([s, sets, counts]) => {
      setStaff(s)
      setSettings(sets)
      setUnreadCounts(counts)
    }).finally(() => setLoading(false))
  }, [])

  const periodText = () => {
    if (!settings?.period) return ''
    const [y, m] = settings.period.split('-')
    return `${y}年${parseInt(m)}月分`
  }

  const deadlineBanner = () => {
    if (!settings?.deadline) return null
    const d = new Date(settings.deadline)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const daysLeft = Math.ceil((d.getTime() - today.getTime()) / 86400000)
    if (daysLeft < 0) return null
    const dateStr = `${d.getMonth() + 1}月${d.getDate()}日`
    if (daysLeft === 0) return { text: `本日締切！(${dateStr})`, urgent: true }
    if (daysLeft <= 3) return { text: `⚠ 提出期限: ${dateStr}（あと${daysLeft}日）`, urgent: true }
    return { text: `📅 提出期限: ${dateStr}（あと${daysLeft}日）`, urgent: false }
  }

  const getUnread = (name: string) =>
    (unreadCounts[name] ?? 0) + (unreadCounts['ALL'] ?? 0)

  const banner = settings ? deadlineBanner() : null

  if (loading) {
    return (
      <div className="min-h-screen bg-orange-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-orange-50">
      {/* ヘッダー */}
      <div className="bg-orange-500 text-white text-center px-4 pt-10 pb-8 shadow-lg">
        <p className="text-orange-200 text-sm tracking-widest mb-1">SOBAANSIO</p>
        <h1 className="text-3xl font-bold">蕎麦庵sio</h1>
        <p className="text-orange-100 mt-1">シフト希望提出</p>
        {settings?.period && (
          <span className="inline-block mt-3 bg-orange-400 text-white text-sm font-medium px-4 py-1 rounded-full">
            {periodText()}
          </span>
        )}
      </div>

      {/* 締切バナー */}
      {banner && (
        <div className={`mx-4 mt-4 p-3 rounded-2xl text-center text-sm font-medium ${
          banner.urgent
            ? 'bg-red-100 text-red-700 border border-red-200'
            : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
        }`}>
          {banner.text}
        </div>
      )}

      {/* スタッフ選択 */}
      <div className="px-4 mt-6">
        <p className="text-center text-gray-500 text-sm mb-4">名前を選んでください</p>
        {staff.length === 0 ? (
          <div className="text-center text-gray-400 py-10">
            <p className="text-4xl mb-3">👥</p>
            <p className="text-sm">スタッフが登録されていません</p>
            <p className="text-xs mt-1">管理者画面から追加してください</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {staff.map(s => {
              const unread = getUnread(s.name)
              return (
                <Link
                  key={s.id}
                  href={`/staff/${encodeURIComponent(s.name)}`}
                  className="relative bg-white rounded-2xl p-5 text-center shadow-sm border border-orange-100 active:scale-95 transition-transform"
                >
                  <div className="text-3xl mb-2">👤</div>
                  <div className="font-semibold text-gray-800 text-sm">{s.name}</div>
                  {unread > 0 && (
                    <span className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* 管理者リンク */}
      <div className="text-center mt-10 pb-10">
        <Link href="/admin" className="text-gray-400 text-xs underline underline-offset-2">
          管理者ページ
        </Link>
      </div>
    </div>
  )
}
