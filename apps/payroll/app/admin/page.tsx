'use client'

import { useEffect, useState, useCallback } from 'react'
import type { StaffMember, WorkRecord } from '@/lib/types'
import { calcSalary, type StaffSalaryJson, type SalaryExportJson, isHoliday } from '@/lib/salary'

interface StaffData {
  records: WorkRecord[]
  transportFee: number
}

const DAYS_JA = ['日', '月', '火', '水', '木', '金', '土']

function getPeriodDates(): { dateStr: string; label: string }[] {
  const today = new Date()
  const y = today.getFullYear()
  const m = today.getMonth() + 1
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
    date: dateStr,
    clockIn: '',
    clockOut: '',
    breakStart: '',
    breakEnd: '',
  }))
}

export default function AdminPage() {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [selectedStaff, setSelectedStaff] = useState<string>('')
  const [staffData, setStaffData] = useState<Record<string, StaffData>>({})

  useEffect(() => {
    fetch('/api/staff')
      .then((r) => r.json())
      .then((list: StaffMember[]) => {
        setStaff(list)
        if (list.length > 0) setSelectedStaff(list[0].name)
        const initial: Record<string, StaffData> = {}
        list.forEach((s) => {
          initial[s.name] = { records: initRecords(), transportFee: 0 }
        })
        setStaffData(initial)
      })
      .catch((err) => console.error('Failed to fetch staff:', err))
  }, [])

  const currentData = staffData[selectedStaff] ?? { records: initRecords(), transportFee: 0 }

  const updateRecord = useCallback(
    (idx: number, field: keyof WorkRecord, value: string) => {
      setStaffData((prev) => {
        const data = prev[selectedStaff] ?? { records: initRecords(), transportFee: 0 }
        const records = [...data.records]
        records[idx] = { ...records[idx], [field]: value }
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

  const result = calcSalary(selectedStaff, currentData.records, currentData.transportFee)

  const handleDownload = () => {
    const staffList: StaffSalaryJson[] = staff.map((s) => {
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
        records: data.records,
      }
    })

    const startYear = PERIOD_DATES[0].dateStr.split('-')[0]
    const startMonth = PERIOD_DATES[0].dateStr.split('-')[1]
    const endYear = PERIOD_DATES[PERIOD_DATES.length - 1].dateStr.split('-')[0]
    const endMonth = PERIOD_DATES[PERIOD_DATES.length - 1].dateStr.split('-')[1]
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

  const periodStr = PERIOD_DATES.length > 0
    ? `${PERIOD_DATES[0].label.split('(')[0]} ～ ${PERIOD_DATES[PERIOD_DATES.length - 1].label.split('(')[0]}`
    : '期間不明'

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">給料計算</h1>
        <p className="text-gray-600 mb-6">{periodStr}</p>

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
                {currentData.records.map((record, idx) => (
                  <tr key={record.date} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <span>{PERIOD_DATES[idx]?.label || ''}</span>
                      {isHoliday(record.date) && <span className="text-red-500 ml-1 font-semibold">祝</span>}
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="time"
                        value={record.clockIn}
                        onChange={(e) => updateRecord(idx, 'clockIn', e.target.value)}
                        className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="time"
                        value={record.breakStart}
                        onChange={(e) => updateRecord(idx, 'breakStart', e.target.value)}
                        className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="time"
                        value={record.breakEnd}
                        onChange={(e) => updateRecord(idx, 'breakEnd', e.target.value)}
                        className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="time"
                        value={record.clockOut}
                        onChange={(e) => updateRecord(idx, 'clockOut', e.target.value)}
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
