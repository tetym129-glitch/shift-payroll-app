'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { StaffMember, ShiftSubmission, AppSettings } from '@/lib/types'

type Tab = '提出状況' | 'スタッフ管理' | '設定' | 'シフト表'

function ShiftSummary({ shifts }: { shifts: Record<string, { type: string | null; time: string }> }) {
  const counts: Record<string, number> = { '昼': 0, '夜': 0, '1日': 0, '×': 0 }
  Object.values(shifts).forEach(s => { if (s.type && s.type in counts) counts[s.type]++ })
  const entries = Object.entries(counts).filter(([, v]) => v > 0)
  if (entries.length === 0) return <span className="text-xs text-gray-400">入力なし</span>
  return (
    <div className="flex gap-1.5 flex-wrap mt-1">
      {entries.map(([type, count]) => (
        <span key={type} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
          {type}: {count}日
        </span>
      ))}
    </div>
  )
}

export default function AdminPage() {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [authed, setAuthed] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('adminAuthed') === '1'
    }
    return false
  })
  const [pinError, setPinError] = useState(false)
  const [tab, setTab] = useState<Tab>('提出状況')

  const [staff, setStaff] = useState<StaffMember[]>([])
  const [submissions, setSubmissions] = useState<ShiftSubmission[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(false)

  const [settingsPeriod, setSettingsPeriod] = useState('')
  const [settingsDeadline, setSettingsDeadline] = useState('')
  const [settingsSaved, setSettingsSaved] = useState(false)

  const [newStaff, setNewStaff] = useState('')
  const [addingStaff, setAddingStaff] = useState(false)

  const [reminderSent, setReminderSent] = useState(false)
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null)

  const [pinStatus, setPinStatus] = useState<Record<string, boolean>>({})
  const [settingPinFor, setSettingPinFor] = useState<string | null>(null)
  const [newPinValue, setNewPinValue] = useState('')
  const [savingPin, setSavingPin] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [staffData, settingsData, pinStatusData] = await Promise.all([
        fetch('/api/staff').then(r => r.json()),
        fetch('/api/settings').then(r => r.json()) as Promise<AppSettings>,
        fetch('/api/staff-pin').then(r => r.json()),
      ])
      setStaff(staffData)
      setSettings(settingsData)
      setSettingsPeriod(settingsData.period)
      setSettingsDeadline(settingsData.deadline ?? '')
      setPinStatus(pinStatusData)

      const subs = await fetch(`/api/shifts?period=${settingsData.period}`).then(r => r.json())
      setSubmissions(Array.isArray(subs) ? subs : [])
    } finally {
      setLoading(false)
    }
  }, [])

  // sessionStorageで既認証の場合、ページ表示時に自動でデータ読み込み
  useEffect(() => {
    if (authed) loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLogin = async () => {
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    })
    const { valid } = await res.json()
    if (valid) {
      sessionStorage.setItem('adminAuthed', '1')
      setAuthed(true)
      setPinError(false)
      loadData()
    } else {
      setPinError(true)
    }
  }

  const sendReminder = async (target: string, msg: string) => {
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff: target, message: msg }),
    })
  }

  const sendToUnsubmitted = async () => {
    const submitted = new Set(submissions.map(s => s.staff))
    const targets = staff.filter(s => !submitted.has(s.name))
    if (targets.length === 0) {
      alert('未提出のスタッフはいません')
      return
    }
    const [y, m] = (settings?.period ?? '').split('-')
    const msg = `${y}年${parseInt(m)}月分のシフト希望がまだ提出されていません。締切日までに提出をお願いします。`
    await Promise.all(targets.map(s => sendReminder(s.name, msg)))
    setReminderSent(true)
    setTimeout(() => setReminderSent(false), 3000)
  }

  const sendToAll = async () => {
    const [y, m] = (settings?.period ?? '').split('-')
    const msg = `${y}年${parseInt(m)}月分のシフト希望提出のご案内です。期限内の提出をよろしくお願いします。`
    await sendReminder('ALL', msg)
    setReminderSent(true)
    setTimeout(() => setReminderSent(false), 3000)
  }

  const handleAddStaff = async () => {
    if (!newStaff.trim()) return
    setAddingStaff(true)
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newStaff.trim() }),
      })
      const newMember = await res.json()
      setStaff(prev => [...prev, newMember])
      setNewStaff('')
    } finally {
      setAddingStaff(false)
    }
  }

  const handleSavePin = async (name: string) => {
    if (newPinValue && !/^\d{4}$/.test(newPinValue)) {
      alert('PINは4桁の数字で入力してください')
      return
    }
    setSavingPin(true)
    try {
      await fetch('/api/staff-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, pin: newPinValue || null }),
      })
      setPinStatus(prev => ({ ...prev, [name]: !!newPinValue }))
      setSettingPinFor(null)
      setNewPinValue('')
    } finally {
      setSavingPin(false)
    }
  }

  const handleDeleteStaff = async (id: string, name: string) => {
    if (!confirm(`「${name}」を削除しますか？`)) return
    await fetch('/api/staff', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setStaff(prev => prev.filter(s => s.id !== id))
  }

  const handleSaveSettings = async () => {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period: settingsPeriod, deadline: settingsDeadline || null }),
    })
    const subs = await fetch(`/api/shifts?period=${settingsPeriod}`).then(r => r.json())
    setSubmissions(Array.isArray(subs) ? subs : [])
    setSettings(prev => prev ? { ...prev, period: settingsPeriod, deadline: settingsDeadline || null } : null)
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 3000)
  }

  // ---- ログイン画面 ----
  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 w-full max-w-xs shadow-2xl">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">🔐</div>
            <h1 className="text-xl font-bold text-gray-800">管理者ログイン</h1>
            <p className="text-gray-400 text-sm mt-1">PINコードを入力してください</p>
          </div>
          <input
            type="password"
            inputMode="numeric"
            placeholder="PIN"
            value={pin}
            onChange={e => setPin(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-center text-2xl tracking-[0.5em] focus:outline-none focus:border-orange-400"
          />
          {pinError && <p className="text-red-500 text-sm text-center mt-2">PINが正しくありません</p>}
          <button
            onClick={handleLogin}
            className="w-full bg-orange-500 text-white py-3 rounded-2xl font-bold mt-4 active:bg-orange-600"
          >
            ログイン
          </button>
          <button
            onClick={() => router.push('/')}
            className="w-full text-gray-400 text-sm mt-3 py-2"
          >
            ← トップに戻る
          </button>
        </div>
      </div>
    )
  }

  const submittedNames = new Set(submissions.map(s => s.staff))
  const [year, month] = (settings?.period ?? '').split('-').map(Number)
  const submittedCount = submittedNames.size
  const unsubmittedCount = staff.length - submittedCount

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-gray-800 text-white px-4 py-4 flex items-center justify-between shadow-lg">
        <div>
          <h1 className="font-bold text-lg">管理者画面</h1>
          {settings && (
            <p className="text-gray-400 text-xs mt-0.5">{year}年{month}月分</p>
          )}
        </div>
        <button
          onClick={() => { sessionStorage.removeItem('adminAuthed'); setAuthed(false) }}
          className="text-gray-400 text-xs border border-gray-600 rounded-xl px-3 py-1.5"
        >
          ログアウト
        </button>
      </div>

      {/* タブ */}
      <div className="flex border-b border-gray-200 bg-white shadow-sm overflow-x-auto">
        {(['提出状況', 'シフト表', 'スタッフ管理', '設定'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => {
              if (t === 'シフト表') {
                router.push('/admin/calendar')
              } else {
                setTab(t)
              }
            }}
            className={`flex-1 py-3 text-sm font-medium transition-colors whitespace-nowrap px-3 ${
              tab === t
                ? 'text-orange-500 border-b-2 border-orange-500'
                : 'text-gray-500'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-orange-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="p-4">

          {/* ========== 提出状況 ========== */}
          {tab === '提出状況' && (
            <div>
              {/* サマリー */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-white rounded-2xl p-3 text-center border border-gray-100 shadow-sm">
                  <div className="text-2xl font-bold text-gray-700">{staff.length}</div>
                  <div className="text-gray-400 text-xs mt-0.5">総スタッフ</div>
                </div>
                <div className="bg-green-50 rounded-2xl p-3 text-center border border-green-100 shadow-sm">
                  <div className="text-2xl font-bold text-green-600">{submittedCount}</div>
                  <div className="text-green-600 text-xs mt-0.5">提出済み</div>
                </div>
                <div className="bg-red-50 rounded-2xl p-3 text-center border border-red-100 shadow-sm">
                  <div className="text-2xl font-bold text-red-500">{unsubmittedCount}</div>
                  <div className="text-red-500 text-xs mt-0.5">未提出</div>
                </div>
              </div>

              {/* リマインドボタン */}
              {reminderSent && (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-3 text-center text-green-700 text-sm mb-3">
                  ✓ リマインドを送信しました
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                  onClick={sendToUnsubmitted}
                  className="bg-red-500 text-white py-3 rounded-2xl text-sm font-medium active:bg-red-600"
                >
                  未提出者にリマインド
                </button>
                <button
                  onClick={sendToAll}
                  className="bg-gray-600 text-white py-3 rounded-2xl text-sm font-medium active:bg-gray-700"
                >
                  全員にリマインド
                </button>
              </div>

              {/* スタッフ一覧 */}
              <div className="space-y-2">
                {staff.map(s => {
                  const submitted = submittedNames.has(s.name)
                  const sub = submissions.find(x => x.staff === s.name)
                  const isExpanded = expandedStaff === s.name
                  return (
                    <div
                      key={s.id}
                      className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
                        submitted ? 'border-green-100' : 'border-red-100'
                      }`}
                    >
                      <button
                        onClick={() => submitted && setExpandedStaff(isExpanded ? null : s.name)}
                        className="w-full px-4 py-3 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-2.5 h-2.5 rounded-full ${submitted ? 'bg-green-400' : 'bg-red-300'}`} />
                          <span className="font-medium text-gray-800">{s.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                            submitted ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                          }`}>
                            {submitted ? '提出済み' : '未提出'}
                          </span>
                          {submitted && (
                            <span className="text-gray-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
                          )}
                        </div>
                      </button>
                      {submitted && sub && isExpanded && (
                        <div className="px-4 pb-3 border-t border-gray-50">
                          <p className="text-gray-400 text-xs mb-1">
                            最終更新: {sub.updatedAt ? new Date(sub.updatedAt).toLocaleString('ja-JP') : '—'}
                          </p>
                          <ShiftSummary shifts={sub.shifts} />
                          <div className="mt-2 space-y-1 max-h-60 overflow-y-auto">
                            {Object.entries(sub.shifts)
                              .filter(([, v]) => v.type)
                              .sort(([a], [b]) => a.localeCompare(b))
                              .map(([date, v]) => {
                                const d = new Date(date)
                                const typeColor: Record<string, string> = {
                                  '昼': 'text-yellow-600 bg-yellow-50',
                                  '夜': 'text-indigo-600 bg-indigo-50',
                                  '1日': 'text-green-600 bg-green-50',
                                  '×': 'text-red-500 bg-red-50',
                                }
                                return (
                                  <div key={date} className="flex items-center gap-2 text-xs text-gray-600">
                                    <span className="w-16 text-gray-500">
                                      {d.getMonth() + 1}/{d.getDate()}({['日','月','火','水','木','金','土'][d.getDay()]})
                                    </span>
                                    <span className={`px-2 py-0.5 rounded-full font-medium ${typeColor[v.type!] ?? ''}`}>
                                      {v.type}
                                    </span>
                                    {v.time && <span className="text-gray-400">{v.time}</span>}
                                  </div>
                                )
                              })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ========== スタッフ管理 ========== */}
          {tab === 'スタッフ管理' && (
            <div>
              <div className="bg-white rounded-2xl p-4 mb-4 border border-gray-100 shadow-sm">
                <h2 className="font-bold text-gray-700 mb-3 text-sm">スタッフを追加</h2>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="名前を入力"
                    value={newStaff}
                    onChange={e => setNewStaff(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddStaff()}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-300"
                  />
                  <button
                    onClick={handleAddStaff}
                    disabled={addingStaff || !newStaff.trim()}
                    className="bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
                  >
                    {addingStaff ? '...' : '追加'}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {staff.map(s => (
                  <div key={s.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">👤</span>
                        <div>
                          <span className="font-medium text-gray-800">{s.name}</span>
                          <div className="mt-0.5">
                            {pinStatus[s.name] ? (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">🔒 PIN設定済み</span>
                            ) : (
                              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">🔓 PIN未設定</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSettingPinFor(settingPinFor === s.name ? null : s.name)
                            setNewPinValue('')
                          }}
                          className="text-orange-500 text-xs border border-orange-200 rounded-xl px-3 py-1.5 active:bg-orange-50"
                        >
                          PIN
                        </button>
                        <button
                          onClick={() => handleDeleteStaff(s.id, s.name)}
                          className="text-red-400 text-xs border border-red-200 rounded-xl px-3 py-1.5 active:bg-red-50"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                    {settingPinFor === s.name && (
                      <div className="px-4 pb-3 border-t border-gray-100 bg-gray-50">
                        <p className="text-xs text-gray-500 mt-2 mb-1.5">
                          {pinStatus[s.name] ? 'PINを変更・削除できます' : '4桁のPINを設定してください'}
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={4}
                            placeholder={pinStatus[s.name] ? '新しいPIN（空欄で削除）' : '4桁の数字'}
                            value={newPinValue}
                            onChange={e => setNewPinValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
                            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-300 bg-white"
                          />
                          <button
                            onClick={() => handleSavePin(s.name)}
                            disabled={savingPin}
                            className="bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
                          >
                            {savingPin ? '...' : '保存'}
                          </button>
                        </div>
                        {pinStatus[s.name] && !newPinValue && (
                          <button
                            onClick={() => handleSavePin(s.name)}
                            className="text-red-400 text-xs mt-1.5"
                          >
                            PINを削除する
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {staff.length === 0 && (
                  <div className="text-center text-gray-400 py-8 text-sm">
                    スタッフが登録されていません
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========== 設定 ========== */}
          {tab === '設定' && (
            <div className="space-y-3">
              {/* 来月切り替えボタン */}
              {settings && (() => {
                const [cy, cm] = settings.period.split('-').map(Number)
                const nm = cm === 12 ? 1 : cm + 1
                const ny = cm === 12 ? cy + 1 : cy
                const nextPeriod = `${ny}-${String(nm).padStart(2, '0')}`
                const handleNextMonth = async () => {
                  await fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ period: nextPeriod, deadline: null }),
                  })
                  await loadData()
                  setSettingsPeriod(nextPeriod)
                  setSettingsDeadline('')
                }
                return (
                  <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
                    <p className="text-xs text-orange-600 font-medium mb-1">現在の対象月</p>
                    <p className="text-2xl font-bold text-gray-800 mb-3">{cy}年{cm}月分</p>
                    <button
                      onClick={handleNextMonth}
                      className="w-full bg-orange-500 text-white py-3.5 rounded-2xl font-bold active:bg-orange-600"
                    >
                      {ny}年{nm}月分に切り替える →
                    </button>
                  </div>
                )
              })()}

            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <h2 className="font-bold text-gray-700 mb-4">手動で設定</h2>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-600 block mb-1.5">
                    対象月
                  </label>
                  <input
                    type="month"
                    value={settingsPeriod}
                    onChange={e => setSettingsPeriod(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-600 block mb-1.5">
                    締切日
                  </label>
                  <input
                    type="date"
                    value={settingsDeadline}
                    onChange={e => setSettingsDeadline(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400"
                  />
                  <p className="text-gray-400 text-xs mt-1">スタッフに締切日が表示されます</p>
                </div>

                <button
                  onClick={handleSaveSettings}
                  className="w-full bg-orange-500 text-white py-3.5 rounded-2xl font-bold active:bg-orange-600"
                >
                  保存する
                </button>

                {settingsSaved && (
                  <p className="text-green-600 text-sm text-center font-medium">✓ 保存しました</p>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400 font-medium mb-2">管理者PINの変更</p>
                <p className="text-xs text-gray-400">
                  PINはVercelの環境変数 <code className="bg-gray-100 px-1 rounded">ADMIN_PIN</code> で設定してください
                </p>
              </div>
            </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
