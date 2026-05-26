export type ShiftType = '昼' | '夜' | '1日' | '×' | null

export interface DayShift {
  type: ShiftType
  time: string
}

export interface MonthShifts {
  [date: string]: DayShift
}

export interface ShiftSubmission {
  id: string
  staff: string
  period: string
  shifts: MonthShifts
  submittedAt: string | null
  updatedAt: string | null
}

export interface StaffMember {
  id: string
  name: string
  active: boolean
  order: number
}

export interface AppSettings {
  deadline: string | null
  period: string
}

export interface Notification {
  id: string
  staff: string
  message: string
  read: boolean
  createdAt: string
}
