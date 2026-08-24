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
      '08-11', // 山の日
      '08-13', // お盆
      '08-14', // お盆
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

// 給与所得税額表（月額、扶養親族1人：令和8年分・国税庁公式）
// 社会保険料等控除後の給与額に対応する所得税額
function getWithholdingTax(monthlyWage: number): number {
  if (monthlyWage < 105000) return 0
  if (monthlyWage < 107000) return 0
  if (monthlyWage < 109000) return 0
  if (monthlyWage < 111000) return 0
  if (monthlyWage < 113000) return 0
  if (monthlyWage < 115000) return 0
  if (monthlyWage < 117000) return 0
  if (monthlyWage < 119000) return 0
  if (monthlyWage < 121000) return 0
  if (monthlyWage < 123000) return 0
  if (monthlyWage < 125000) return 0
  if (monthlyWage < 127000) return 0
  if (monthlyWage < 129000) return 0
  if (monthlyWage < 131000) return 0
  if (monthlyWage < 133000) return 0
  if (monthlyWage < 135000) return 0
  if (monthlyWage < 137000) return 0
  if (monthlyWage < 139000) return 190
  if (monthlyWage < 141000) return 300
  if (monthlyWage < 143000) return 400
  if (monthlyWage < 145000) return 500
  if (monthlyWage < 147000) return 600
  if (monthlyWage < 149000) return 700
  if (monthlyWage < 151000) return 810
  if (monthlyWage < 153000) return 910
  if (monthlyWage < 155000) return 1010
  if (monthlyWage < 157000) return 1110
  if (monthlyWage < 159000) return 1210
  if (monthlyWage < 161000) return 1300
  if (monthlyWage < 163000) return 1370
  if (monthlyWage < 165000) return 1440
  if (monthlyWage < 167000) return 1510
  if (monthlyWage < 169000) return 1580
  if (monthlyWage < 171000) return 1650
  if (monthlyWage < 173000) return 1730
  if (monthlyWage < 175000) return 1800
  if (monthlyWage < 177000) return 1870
  if (monthlyWage < 179000) return 1940
  if (monthlyWage < 181000) return 2010
  if (monthlyWage < 183000) return 2080
  if (monthlyWage < 185000) return 2150
  if (monthlyWage < 187000) return 2230
  if (monthlyWage < 189000) return 2300
  if (monthlyWage < 191000) return 2370
  if (monthlyWage < 193000) return 2440
  if (monthlyWage < 195000) return 2510
  // 195,000円以上の場合は、以降の計算に従う
  return Math.floor((monthlyWage - 195000) * 0.1 + 2510)
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
