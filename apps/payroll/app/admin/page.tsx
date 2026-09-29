'use client'

import { useEffect, useState, useCallback } from 'react'
import type { StaffMember, WorkRecord } from '@/lib/types'
import { calcSalary, type StaffSalaryJson, type SalaryExportJson, isHoliday } from '@/lib/salary'

interface StaffData {
  records: WorkRecord[]
  transportFee: number
}

const DAYS_JA = ['日', '月', '火', '水', '木', '金', '土']
const STORAGE_KEY = 'payrollData'
const STORAGE_VERSION_KEY = 'payrollDataVersion'
const STORAGE_VERSION = '2'

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// "YYYY-MM-DD" をローカル日付として読む（new Date("YYYY-MM-DD") はUTC扱いになるため）
function parseDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function addDays(s: string, days: number): string {
  const d = parseDateStr(s)
  d.setDate(d.getDate() + days)
  return toDateStr(d)
}

function getPeriodDates(startDate: string, endDate: string): { dateStr: string; label: string }[] {
  const dates: { dateStr: string; label: string }[] = []
  const end = parseDateStr(endDate)
  for (let d = parseDateStr(startDate); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    dates.push({ dateStr: toDateStr(d), label: `${d.getMonth() + 1}/${d.getDate()}(${DAYS_JA[d.getDay()]})` })
  }
  return dates
}

function emptyRecord(date: string): WorkRecord {
  return { date, clockIn: '', clockOut: '', breakStart: '', breakEnd: '' }
}

// 旧版は画面の日付より1日後の日付で保存していた。画面で見えていた日付に付け直す。
// 旧版の初期データは21日始まりなので、それで旧形式かどうかを見分ける。
function migrateFromV1(data: Record<string, StaffData>): Record<string, StaffData> {
  const out: Record<string, StaffData> = {}
  for (const [name, sd] of Object.entries(data)) {
    const records = sd?.records ?? []
    const shifted = records.length > 0 && records[0].date.endsWith('-21')
    out[name] = {
      transportFee: sd?.transportFee ?? 0,
      records: shifted ? records.map((r) => ({ ...r, date: addDays(r.date, -1) })) : records,
    }
  }
  return out
}

export default function AdminPage() {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [selectedStaff, setSelectedStaff] = useState<string>('')
  const [staffData, setStaffData] = useState<Record<string, StaffData>>({})
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  useEffect(() => {
    // デフォルト期間：前月21日～当月20日
    const today = new Date()
    setStartDate(toDateStr(new Date(today.getFullYear(), today.getMonth() - 1, 21)))
    setEndDate(toDateStr(new Date(today.getFullYear(), today.getMonth(), 20)))
  }, [])

  useEffect(() => {
    fetch('/api/staff')
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : []
        setStaff(list)
        if (list.length > 0) setSelectedStaff(list[0].name)

        let restored: Record<string, StaffData> = {}
        try {
          const saved = localStorage.getItem(STORAGE_KEY)
          if (saved) {
            restored = JSON.parse(saved)
            if (localStorage.getItem(STORAGE_VERSION_KEY) !== STORAGE_VERSION) {
              localStorage.setItem(`${STORAGE_KEY}_backup_v1`, saved)
              restored = migrateFromV1(restored)
            }
          }
          localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION)
        } catch (err) {
          console.error('Failed to restore payroll data:', err)
        }
        list.forEach((s) => {
          if (!restored[s.name]) restored[s.name] = { records: [], transportFee: 0 }
        })
        setStaffData(restored)
      })
      .catch((err) => {
        console.error('Failed to fetch staff:', err)
        setStaff([])
      })
  }, [])

  useEffect(() => {
    if (Object.keys(staffData).length === 0) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(staffData))
    } catch (err) {
      console.error('Failed to save payroll data:', err)
    }
  }, [staffData])

  const periodDates = startDate && endDate ? getPeriodDates(startDate, endDate) : []

  const recordsInPeriod = (records: WorkRecord[]): WorkRecord[] =>
    periodDates.map(({ dateStr }) => records.find((r) => r.date === dateStr) ?? emptyRecord(dateStr))

  const currentData = staffData[selectedStaff] ?? { records: [], transportFee: 0 }
  const rows = recordsInPeriod(currentData.records)

  const updateRecord = useCallback(
    (date: string, field: keyof WorkRecord, value: string) => {
      setStaffData((prev) => {
        const data = prev[selectedStaff] ?? { records: [], transportFee: 0 }
        const exists = data.records.some((r) => r.date === date)
        const records = exists
          ? data.records.map((r) => (r.date === date ? { ...r, [field]: value } : r))
          : [...data.records, { ...emptyRecord(date), [field]: value }]
        return { ...prev, [selectedStaff]: { ...data, records } }
      })
    },
    [selectedStaff]
  )

  const updateTransport = useCallback(
    (value: number) => {
      setStaffData((prev) => {
        const data = prev[selectedStaff] ?? { records: [], transportFee: 0 }
        return { ...prev, [selectedStaff]: { ...data, transportFee: value } }
      })
    },
    [selectedStaff]
  )

  const result = calcSalary(selectedStaff, rows, currentData.transportFee)

  const handleDownload = () => {
    const staffList: StaffSalaryJson[] = staff.map((s) => {
      const data = staffData[s.name] ?? { records: [], transportFee: 0 }
      const periodRecords = recordsInPeriod(data.records)
      const r = calcSalary(s.name, periodRecords, data.transportFee)
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
        records: periodRecords,
      }
    })

    const startYear = periodDates[0].dateStr.split('-')[0]
    const startMonth = periodDates[0].dateStr.split('-')[1]
    const endYear = periodDates[periodDates.length - 1].dateStr.split('-')[0]
    const endMonth = periodDates[periodDates.length - 1].dateStr.split('-')[1]
    const periodStr = `${startYear}-${startMonth}-${endYear}-${endMonth}`

    const json: SalaryExportJson = {
      period: periodStr,
      createdAt: new Date().toISOString(),
      staff: staffList,
    }

    const dataStr = JSON.stringify(json, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `payroll_${periodStr}_${new Date().toISOString().split('T')[0]}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const periodStr = periodDates.length > 0
    ? `${periodDates[0].label.split('(')[0]} ～ ${periodDates[periodDates.length - 1].label.split('(')[0]}`
    : '期間を選択してください'

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">給料計算</h1>
        <p className="text-gray-600 mb-6">{periodStr}</p>

        {/* Period Date Selector */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <label className="block text-sm font-semibold mb-3">計算期間を選択</label>
          <div className="flex gap-4 items-center">
            <div className="flex items-center gap-2">
              <label htmlFor="startDate" className="text-sm font-medium">開始日：</label>
              <input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="endDate" className="text-sm font-medium">終了日：</label>
              <input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Staff Tabs */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="flex flex-wrap gap-2">
            {staff.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedStaff(s.name)}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  selectedStaff === s.name
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {/* Time Entry Table */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">日付</th>
                  <th className="px-4 py-2 text-left font-semibold">出勤</th>
                  <th className="px-4 py-2 text-left font-semibold">休憩開始</th>
                  <th className="px-4 py-2 text-left font-semibold">休憩終了</th>
                  <th className="px-4 py-2 text-left font-semibold">退勤</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((record, idx) => (
                  <tr key={record.date} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <span>{periodDates[idx].label}</span>
                      {isHoliday(record.date) && <span className="text-red-500 ml-1 font-semibold">祝</span>}
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="time"
                        value={record.clockIn}
                        onChange={(e) => updateRecord(record.date, 'clockIn', e.target.value)}
                        className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="time"
                        value={record.breakStart}
                        onChange={(e) => updateRecord(record.date, 'breakStart', e.target.value)}
                        className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="time"
                        value={record.breakEnd}
                        onChange={(e) => updateRecord(record.date, 'breakEnd', e.target.value)}
                        className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="time"
                        value={record.clockOut}
                        onChange={(e) => updateRecord(record.date, 'clockOut', e.target.value)}
                        className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Transport Fee Input */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <label className="block text-sm font-semibold mb-2">交通費</label>
          <input
            type="number"
            min="0"
            value={currentData.transportFee || ''}
            onChange={(e) => updateTransport(Number(e.target.value) || 0)}
            className="w-24 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="0"
          />
          <span className="ml-2 text-gray-600">円</span>
        </div>

        {/* Calculation Results */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-md p-4">
            <h2 className="text-lg font-semibold mb-4 border-b pb-2">勤務内容</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">勤務日数</span>
                <span className="font-semibold">{result.workDays}日</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">勤務時間</span>
                <span className="font-semibold">{result.workHoursLabel}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-4">
            <h2 className="text-lg font-semibold mb-4 border-b pb-2">給与計算</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">基本給</span>
                <span className="font-semibold">¥{result.baseWage.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">交通費</span>
                <span className="font-semibold">¥{result.transportFee.toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-semibold text-base border-t pt-2 mt-2">
                <span>支給額</span>
                <span>¥{result.totalIncome.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-4">
            <h2 className="text-lg font-semibold mb-4 border-b pb-2">控除</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">所得税</span>
                <span className="font-semibold">¥{result.incomeTax.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">雇用保険</span>
                <span className="font-semibold">¥{result.employmentInsurance.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 rounded-lg shadow-md p-4 border-2 border-blue-200">
            <h2 className="text-lg font-semibold mb-4 border-b pb-2 text-blue-900">手取り</h2>
            <div className="text-3xl font-bold text-blue-600">
              ¥{result.netPay.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Export Button */}
        <button
          onClick={handleDownload}
          className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg transition"
        >
          JSON 出力
        </button>
      </div>
    </div>
  )
}
