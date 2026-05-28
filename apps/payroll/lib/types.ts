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

export interface StaffMember {
  id: string
  name: string
  active: boolean
  order: number
}

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
