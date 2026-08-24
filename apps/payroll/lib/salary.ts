// 給料計算ロジック

export interface WorkRecord {
  date: string       // YYYY-MM-DD
  clockIn: string    // HH:MM
  clockOut: string   // HH:MM
  breakStart: string // HH:MM (出 = 休憩開始)
  breakEnd: string   // HH:MM (戻り = 休憩終了)
}

export interface SalaryResult {
  workDays: number
  workMinutes: number
  workHoursLabel: string
  baseWage: number
  holidayBonus: number
  transportFee: number
  totalIncome: number
  incomeTax: number
  employmentInsurance: number
  netPay: number
}

// 時給テーブル
// 平日: 全員 1,053円（福井市最低賃金）
// 土日祝: 通常 1,200円 / 研修中（本田・石川・山本・山下・古川・藤森）1,150円
const HOURLY_RATES: Record<string, { weekday: number; holiday: number }> = {
  '坂井': { weekday: 1153, holiday: 1300 },     // 特別レート
  '中上': { weekday: 1053, holiday: 1200 },     // デフォルト
  '小川': { weekday: 1053, holiday: 1200 },     // デフォルト
  '山下': { weekday: 1053, holiday: 1150 },     // 研修中
  '本田': { weekday: 1053, holiday: 1150 },     // 研修中
  '石川': { weekday: 1053, holiday: 1150 },     // 研修中
  '山本': { weekday: 1053, holiday: 1150 },     // 研修中
  '古川': { weekday: 1053, holiday: 1200 },     // 通常
  '藤森': { weekday: 1053, holiday: 1150 },     // 研修中
}
const DEFAULT_RATE = { weekday: 1053, holiday: 1200 }

export function getHourlyRate(name: string) {
  return HOURLY_RATES[name] ?? DEFAULT_RATE
}

// 日本の国民の祝日を判定
function isNationalHoliday(dateStr: string): boolean {
  const [year, month, date] = dateStr.split('-').map(Number)
  const dateKey = `${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`

  // 2026年の国民の祝日（主要なもの）
  const holidays: Record<number, string[]> = {
    2026: [
      '01-01', // 元日
      '01-12', // 成人の日（第2月曜日）
      '02-11', // 建国記念の日
      '02-23', // 天皇誕生日
      '03-21', // 春分の日
      '04-29', // 昭和の日
      '05-03', // 憲法記念日
      '05-04', // みどりの日
      '05-05', // こどもの日
      '07-20', // 海の日（第3月曜日）
      '08-10', // 山の日
      '09-21', // 敬老の日（第3月曜日）
      '09-22', // 秋分の日
      '10-12', // スポーツの日（第2月曜日）
      '11-03', // 文化の日
      '11-23', // 勤労感謝の日
    ],
  }

  return holidays[year]?.includes(dateKey) || false
}

// 土日祝判定
export function isHoliday(dateStr: string): boolean {
  const [year, month, date] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, date)
  const day = d.getDay()
  const isSunday = day === 0
  const isSaturday = day === 6
  const isNational = isNationalHoliday(dateStr)

  return isSunday || isSaturday || isNational
}

// 分を30分単位に切り上げ（出勤打刻用）
function roundUpToHalf(minutes: number): number {
  if (minutes % 30 === 0) return minutes
  return Math.ceil(minutes / 30) * 30
}

// 分を30分単位に切り捨て（退勤打刻用）
function roundDownToHalf(minutes: number): number {
  return Math.floor(minutes / 30) * 30
}

// "HH:MM" -> 分（0時からの分数）
function toMinutes(timeStr: string): number {
  if (!timeStr) return -1
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

// 1レコードの実労働時間（分）と土日祝フラグを返す
export function calcWorkMinutes(record: WorkRecord): { workMin: number; isWeekend: boolean } {
  const clockIn = toMinutes(record.clockIn)
  const clockOut = toMinutes(record.clockOut)
  if (clockIn < 0 || clockOut < 0) return { workMin: 0, isWeekend: false }

  // 出勤: 30分単位切り上げ
  const roundedIn = roundUpToHalf(clockIn)
  // 退勤: 30分単位切り捨て
  const roundedOut = roundDownToHalf(clockOut)

  let workMin = roundedOut - roundedIn
  if (workMin <= 0) return { workMin: 0, isWeekend: isHoliday(record.date) }

  // 休憩時間
  const bStart = toMinutes(record.breakStart)
  const bEnd = toMinutes(record.breakEnd)
  if (bStart >= 0 && bEnd >= 0 && bEnd > bStart) {
    workMin -= (bEnd - bStart)
  }

  if (workMin < 0) workMin = 0

  return { workMin, isWeekend: isHoliday(record.date) }
}

// 給与所得税額表（月額、扶養家族ありの場合：2026年）
// 給与額の範囲に対応する源泉徴収税額
function getWithholdingTax(monthlyWage: number): number {
  if (monthlyWage < 88000) return 0
  if (monthlyWage < 90000) return 0
  if (monthlyWage < 100000) return 0
  if (monthlyWage < 110000) return 0
  if (monthlyWage < 120000) return 0
  if (monthlyWage < 130000) return 0
  if (monthlyWage < 140000) return 0
  if (monthlyWage < 150000) return 0
  if (monthlyWage < 160000) return 1000
  if (monthlyWage < 170000) return 1500
  if (monthlyWage < 180000) return 2000
  if (monthlyWage < 190000) return 2500
  if (monthlyWage < 200000) return 3000
  if (monthlyWage < 210000) return 3500
  if (monthlyWage < 220000) return 4000
  if (monthlyWage < 230000) return 4500
  if (monthlyWage < 240000) return 5000
  if (monthlyWage < 250000) return 5500
  if (monthlyWage < 260000) return 6000
  if (monthlyWage < 270000) return 6500
  if (monthlyWage < 280000) return 7000
  if (monthlyWage < 290000) return 7500
  if (monthlyWage < 300000) return 8000
  if (monthlyWage < 310000) return 8500
  return Math.floor((monthlyWage - 310000) * 0.1 + 8500)
}

// 給料全体の計算
export function calcSalary(
  name: string,
  records: WorkRecord[],
  transportFee: number
): SalaryResult {
  const rate = getHourlyRate(name)

  let weekdayMin = 0
  let weekendMin = 0
  let workDays = 0

  for (const record of records) {
    const { workMin, isWeekend } = calcWorkMinutes(record)
    if (workMin > 0) {
      workDays++
      if (isWeekend) weekendMin += workMin
      else weekdayMin += workMin
    }
  }

  // 基本給: 平日時間×平日時給 ＋ 土日祝時間×土日祝時給
  const baseWage = Math.floor((weekdayMin / 60) * rate.weekday + (weekendMin / 60) * rate.holiday)

  // 土日祝手当なし（時給に含む）
  const holidayBonus = 0

  const totalIncome = baseWage + holidayBonus + transportFee

  // 所得税（源泉徴収税額表：扶養家族あり）
  const incomeTax = getWithholdingTax(totalIncome)

  // 雇用保険: 坂井のみ 支給合計×0.6%切り捨て
  const employmentInsurance = name === '坂井' ? Math.floor(totalIncome * 0.006) : 0

  const netPay = totalIncome - incomeTax - employmentInsurance

  const totalWorkMin = weekdayMin + weekendMin
  const hours = Math.floor(totalWorkMin / 60)
  const mins = totalWorkMin % 60
  const workHoursLabel = `${hours}時間${String(mins).padStart(2, '0')}分`

  return {
    workDays,
    workMinutes: totalWorkMin,
    workHoursLabel,
    baseWage,
    holidayBonus,
    transportFee,
    totalIncome,
    incomeTax,
    employmentInsurance,
    netPay,
  }
}

// JSON出力用フォーマット
export interface StaffSalaryJson {
  name: string
  workDays: number
  workHours: string
  workMinutes: number
  baseWage: number
  holidayBonus: number
  transportFee: number
  totalIncome: number
  incomeTax: number
  employmentInsurance: number
  netPay: number
  records: WorkRecord[]
}

export interface SalaryExportJson {
  period: string
  createdAt: string
  staff: StaffSalaryJson[]
}
