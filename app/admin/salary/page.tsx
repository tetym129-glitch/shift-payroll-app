'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { StaffMember } from '@/lib/types'
import {
  calcSalary,
  calcWorkMinutes,
  isHoliday,
  type WorkRecord,
  type StaffSalaryJson,
  type SalaryExportJson,
} from '@/lib/salary'

interface StaffData {
  records: WorkRecord[]
  transportFee: number
}

const DAYS_JA = ['日', '月', '火', '水', '木', '金', '土']

function getPeriodDates(): { dateStr: string; label: string }[] {
  const today = new Date()
  const y = today.getFullYear()
  const m = today.getMonth() + 1
  // 締め: 前月21日〜当月20日（常に現在の暦月を基準に計算）
  const endMonth = m
  const endYear = y
  const startMonth = m - 1 <= 0 ? 12 : m - 1
  const startYear = m - 1 <= 0 ? y - 1 : y

  const dates: { dateStr: string; label: string }[] = []
  let d = new Date(startYear, startMonth - 1, 21)
  const end = new Date(endYear, endMonth - 1, 20)
  while (d <= end) {
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const label = `${d.getMonth() + 1}/${d.getDate()}(${DAYS_JA[d.getDay()]})`
    dates.push({ dateStr, label })
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  }
  return dates
}

const PERIOD_DATES = getPeriodDates()

function initRecords(): WorkRecord[] {
  return PERIOD_DATES.map(({ dateStr }) => ({
    date: dateStr, clockIn: '', clockOut: '', breakStart: '', breakEnd: '',
  }))
}

export default function SalaryPage() {
  const router = useRouter()
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [selectedStaff, setSelectedStaff] = useState<string>('')
  const [staffData, setStaffData] = useState<Record<string, StaffData>>({})

  useEffect(() => {
    fetch('/api/staff')
      .then(r => r.json())
      .then((list: StaffMember[]) => {
        setStaff(list)
        if (list.length > 0) setSelectedStaff(list[0].name)
        const initial: Record<string, StaffData> = {}
        list.forEach(s => {
          initial[s.name] = { records: initRecords(), transportFee: 0 }
        })
        setStaffData(initial)
      })
  }, [])

  const currentData = staffData[selectedStaff] ?? { records: initRecords(), transportFee: 0 }

  const updateRecord = useCallback((idx: number, field: keyof WorkRecord, value: string) => {
    setStaffData(prev => {
      const data = prev[selectedStaff] ?? { records: initRecords(), transportFee: 0 }
      const records = [...data.records]
      records[idx] = { ...records[idx], [field]: value }
      return { ...prev, [selectedStaff]: { ...data, records } }
    })
  }, [selectedStaff])

  const updateTransport = useCallback((value: number) => {
    setStaffData(prev => {
      const data = prev[selectedStaff] ?? { records: [], transportFee: 0 }
      return { ...prev, [selectedStaff]: { ...data, transportFee: value } }
    })
  }, [selectedStaff])

  // リアルタイム計算
  const result = calcSalary(selectedStaff, currentData.records, currentData.transportFee)

  const handleDownload = () => {
    const staffList: StaffSalaryJson[] = staff.map(s => {
      const data = staffData[s.name] ?? { records: [], transportFee: 0 }
      const r = calcSalary(s.name, data.records, data.transportFee)
      return {
        name: s.name,
        workDays: r.workDays,
        workHours: r.workHoursLabel,
        workMinutes: r.workMinutes,
        baseWage: r.baseWage,
        holidayBonus: r.holidayBonus,
        transportFee: r.transportFee,
        totalIncome: r.totalIncome,
        incomeTax: r.incomeTax,
        employmentInsurance: r.employmentInsurance,
        netPay: r.netPay,
        records: data.records.filter(rec => rec.date && rec.clockIn && rec.clockOut),
      }
    })

    const today = new Date()
    const payload: SalaryExportJson = {
      period: `R${today.getFullYear() - 2018}.${today.getMonth() + 1}`,
      createdAt: today.toISOString().slice(0, 10),
      staff: staffList,
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `salary_${payload.period.replace('.', '_')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

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
          <h1 className="font-bold text-lg">給料計算</h1>
          <p className="text-gray-400 text-xs mt-0.5">
            {PERIOD_DATES.length > 0 && (
              <>
                {PERIOD_DATES[0].label.split('(')[0]}〜{PERIOD_DATES[PERIOD_DATES.length - 1].label.split('(')[0]}
              </>
            )}
          </p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* スタッフ選択タブ */}
        <div className="overflow-x-auto -mx-4 px-4">
          <div className="flex gap-2 min-w-max pb-1">
            {staff.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedStaff(s.name)}
                className={`px-4 py-2 rounded-2xl text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedStaff === s.name
                    ? 'bg-orange-500 text-white'
                    : 'bg-white text-gray-600 border border-gray-200'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {selectedStaff && (
          <>
            {/* 打刻入力テーブル */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="font-bold text-gray-700 text-sm">{selectedStaff} の打刻入力</h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-2 py-2 text-left text-gray-500 font-medium">日付</th>
                      <th className="px-2 py-2 text-left text-gray-500 font-medium">出勤</th>
                      <th className="px-2 py-2 text-left text-gray-500 font-medium">出</th>
                      <th className="px-2 py-2 text-left text-gray-500 font-medium">戻り</th>
                      <th className="px-2 py-2 text-left text-gray-500 font-medium">退勤</th>
                      <th className="px-2 py-2 text-center text-gray-500 font-medium">時間</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentData.records.map((rec, idx) => {
                      const { workMin, isWeekend } = rec.date && rec.clockIn && rec.clockOut
                        ? calcWorkMinutes(rec)
                        : { workMin: 0, isWeekend: false }
                      const holiday = rec.date ? isHoliday(rec.date) : false
                      const periodDate = PERIOD_DATES.find(p => p.dateStr === rec.date)
                      const dow = rec.date ? new Date(rec.date + 'T00:00:00').getDay() : -1
                      const isSun = dow === 0
                      const isSat = dow === 6
                      return (
                        <tr
                          key={idx}
                          className={`border-b border-gray-50 ${holiday || isWeekend ? 'bg-orange-50' : ''}`}
                        >
                          <td className="px-1.5 py-1.5 whitespace-nowrap">
                            <span className={`text-xs font-medium ${isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-gray-600'}`}>
                              {periodDate?.label ?? rec.date}
                            </span>
                          </td>
                          <td className="px-1.5 py-1.5">
                            <input
                              type="time"
                              value={rec.clockIn}
                              onChange={e => updateRecord(idx, 'clockIn', e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-1.5 py-1 text-xs focus:outline-none focus:border-orange-300"
                            />
                          </td>
                          <td className="px-1.5 py-1.5">
                            <input
                              type="time"
                              value={rec.breakStart}
                              onChange={e => updateRecord(idx, 'breakStart', e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-1.5 py-1 text-xs focus:outline-none focus:border-orange-300"
                            />
                          </td>
                          <td className="px-1.5 py-1.5">
                            <input
                              type="time"
                              value={rec.breakEnd}
                              onChange={e => updateRecord(idx, 'breakEnd', e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-1.5 py-1 text-xs focus:outline-none focus:border-orange-300"
                            />
                          </td>
                          <td className="px-1.5 py-1.5">
                            <input
                              type="time"
                              value={rec.clockOut}
                              onChange={e => updateRecord(idx, 'clockOut', e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-1.5 py-1 text-xs focus:outline-none focus:border-orange-300"
                            />
                          </td>
                          <td className="px-1.5 py-1.5 text-center">
                            {workMin > 0 ? (
                              <span className={`font-medium ${isWeekend ? 'text-orange-500' : 'text-gray-600'}`}>
                                {Math.floor(workMin / 60)}h{workMin % 60 > 0 ? `${workMin % 60}m` : ''}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* 交通費 */}
              <div className="px-4 pb-4">
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-gray-600 whitespace-nowrap">
                    交通費（月合計）
                  </label>
                  <div className="flex-1 relative">
                    <input
                      type="number"
                      min={0}
                      value={currentData.transportFee || ''}
                      onChange={e => updateTransport(Number(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-300 pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">円</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 計算結果 */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="font-bold text-gray-700 text-sm">計算結果</h2>
              </div>

              <div className="divide-y divide-gray-50">
                <ResultRow label="労働日数" value={`${result.workDays}日`} />
                <ResultRow label="労働時間" value={result.workHoursLabel} />
                <ResultRow label="基本給" value={`¥${result.baseWage.toLocaleString()}`} />
                <ResultRow label="交通費" value={`¥${result.transportFee.toLocaleString()}`} />
                <ResultRow
                  label="支給合計"
                  value={`¥${result.totalIncome.toLocaleString()}`}
                  highlight
                />
                <ResultRow label="所得税（乙欄）" value={`- ¥${result.incomeTax.toLocaleString()}`} deduct />
                {result.employmentInsurance > 0 && (
                  <ResultRow
                    label="雇用保険（0.6%）"
                    value={`- ¥${result.employmentInsurance.toLocaleString()}`}
                    deduct
                  />
                )}
                <ResultRow
                  label="差引支給額"
                  value={`¥${result.netPay.toLocaleString()}`}
                  total
                />
              </div>
            </div>
          </>
        )}

        {/* JSONダウンロード */}
        <button
          onClick={handleDownload}
          className="w-full bg-gray-700 text-white py-4 rounded-2xl font-bold text-sm active:bg-gray-800"
        >
          JSONをダウンロード
        </button>
      </div>
    </div>
  )
}

function ResultRow({
  label,
  value,
  highlight,
  deduct,
  total,
}: {
  label: string
  value: string
  highlight?: boolean
  deduct?: boolean
  total?: boolean
}) {
  return (
    <div
      className={`flex items-center justify-between px-4 py-3 ${
        total ? 'bg-orange-50' : highlight ? 'bg-gray-50' : ''
      }`}
    >
      <span
        className={`text-sm ${
          total ? 'font-bold text-orange-700' : highlight ? 'font-bold text-gray-700' : 'text-gray-600'
        }`}
      >
        {label}
      </span>
      <span
        className={`text-sm font-medium ${
          total
            ? 'text-orange-600 font-bold text-base'
            : deduct
            ? 'text-red-500'
            : highlight
            ? 'text-gray-800 font-bold'
            : 'text-gray-700'
        }`}
      >
        {value}
      </span>
    </div>
  )
}
