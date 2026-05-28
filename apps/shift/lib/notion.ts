import { Client } from '@notionhq/client'
import type { ShiftSubmission, StaffMember, AppSettings, Notification, MonthShifts } from './types'

const notion = new Client({ auth: process.env.NOTION_API_KEY })

const STAFF_DB = process.env.NOTION_STAFF_DB_ID!
const SHIFTS_DB = process.env.NOTION_SHIFTS_DB_ID!
const SETTINGS_DB = process.env.NOTION_SETTINGS_DB_ID!
const NOTIFICATIONS_DB = process.env.NOTION_NOTIFICATIONS_DB_ID!

// ---- Staff ----

export async function getStaff(): Promise<StaffMember[]> {
  const res = await notion.databases.query({
    database_id: STAFF_DB,
    filter: { property: 'Active', checkbox: { equals: true } },
    sorts: [{ property: 'Order', direction: 'ascending' }],
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return res.results.map((page: any) => ({
    id: page.id,
    name: page.properties.Name.title[0]?.plain_text ?? '',
    active: page.properties.Active.checkbox,
    order: page.properties.Order.number ?? 0,
  }))
}

export async function addStaff(name: string): Promise<StaffMember> {
  const existing = await getStaff()
  const maxOrder = existing.reduce((max, s) => Math.max(max, s.order), 0)
  const page = await notion.pages.create({
    parent: { database_id: STAFF_DB },
    properties: {
      Name: { title: [{ text: { content: name } }] },
      Active: { checkbox: true },
      Order: { number: maxOrder + 1 },
    },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any
  return { id: page.id, name, active: true, order: maxOrder + 1 }
}

export async function deactivateStaff(id: string): Promise<void> {
  await notion.pages.update({ page_id: id, properties: { Active: { checkbox: false } } })
}

// ---- Shifts ----

export async function getShiftSubmission(staff: string, period: string): Promise<ShiftSubmission | null> {
  const res = await notion.databases.query({
    database_id: SHIFTS_DB,
    filter: {
      and: [
        { property: 'Staff', rich_text: { equals: staff } },
        { property: 'Period', rich_text: { equals: period } },
      ],
    },
  })
  if (res.results.length === 0) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = res.results[0] as any
  const shiftsJson = page.properties.ShiftsData.rich_text[0]?.plain_text ?? '{}'
  return {
    id: page.id,
    staff,
    period,
    shifts: JSON.parse(shiftsJson),
    submittedAt: page.properties.SubmittedAt.date?.start ?? null,
    updatedAt: page.properties.UpdatedAt.date?.start ?? null,
  }
}

export async function upsertShiftSubmission(
  staff: string,
  period: string,
  shifts: MonthShifts
): Promise<ShiftSubmission> {
  const existing = await getShiftSubmission(staff, period)
  const now = new Date().toISOString()
  const shiftsJson = JSON.stringify(shifts)

  if (existing) {
    await notion.pages.update({
      page_id: existing.id,
      properties: {
        ShiftsData: { rich_text: [{ text: { content: shiftsJson } }] },
        UpdatedAt: { date: { start: now } },
      },
    })
    return { ...existing, shifts, updatedAt: now }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = await notion.pages.create({
    parent: { database_id: SHIFTS_DB },
    properties: {
      Name: { title: [{ text: { content: `${staff} - ${period}` } }] },
      Staff: { rich_text: [{ text: { content: staff } }] },
      Period: { rich_text: [{ text: { content: period } }] },
      ShiftsData: { rich_text: [{ text: { content: shiftsJson } }] },
      SubmittedAt: { date: { start: now } },
      UpdatedAt: { date: { start: now } },
    },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any
  return { id: page.id, staff, period, shifts, submittedAt: now, updatedAt: now }
}

export async function getAllSubmissions(period: string): Promise<ShiftSubmission[]> {
  const res = await notion.databases.query({
    database_id: SHIFTS_DB,
    filter: { property: 'Period', rich_text: { equals: period } },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return res.results.map((page: any) => ({
    id: page.id,
    staff: page.properties.Staff.rich_text[0]?.plain_text ?? '',
    period,
    shifts: JSON.parse(page.properties.ShiftsData.rich_text[0]?.plain_text ?? '{}'),
    submittedAt: page.properties.SubmittedAt.date?.start ?? null,
    updatedAt: page.properties.UpdatedAt.date?.start ?? null,
  }))
}

// ---- Settings ----

export async function getSettings(): Promise<AppSettings> {
  const res = await notion.databases.query({ database_id: SETTINGS_DB })
  const map: Record<string, string> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const page of res.results as any[]) {
    const key = page.properties.Key.title[0]?.plain_text ?? ''
    const value = page.properties.Value.rich_text[0]?.plain_text ?? ''
    map[key] = value
  }
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const defaultPeriod = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
  return {
    deadline: map['deadline'] || null,
    period: map['period'] || defaultPeriod,
  }
}

async function upsertSetting(key: string, value: string): Promise<void> {
  const res = await notion.databases.query({
    database_id: SETTINGS_DB,
    filter: { property: 'Key', title: { equals: key } },
  })
  if (res.results.length > 0) {
    await notion.pages.update({
      page_id: res.results[0].id,
      properties: { Value: { rich_text: [{ text: { content: value } }] } },
    })
  } else {
    await notion.pages.create({
      parent: { database_id: SETTINGS_DB },
      properties: {
        Key: { title: [{ text: { content: key } }] },
        Value: { rich_text: [{ text: { content: value } }] },
      },
    })
  }
}

export async function updateSettings(data: Partial<AppSettings>): Promise<void> {
  const tasks: Promise<void>[] = []
  if (data.deadline !== undefined) tasks.push(upsertSetting('deadline', data.deadline ?? ''))
  if (data.period !== undefined) tasks.push(upsertSetting('period', data.period))
  await Promise.all(tasks)
}

// ---- Notifications ----

export async function getNotifications(staff: string): Promise<Notification[]> {
  const res = await notion.databases.query({
    database_id: NOTIFICATIONS_DB,
    filter: {
      and: [
        {
          or: [
            { property: 'Staff', rich_text: { equals: staff } },
            { property: 'Staff', rich_text: { equals: 'ALL' } },
          ],
        },
        { property: 'Read', checkbox: { equals: false } },
      ],
    },
    sorts: [{ property: 'CreatedAt', direction: 'descending' }],
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return res.results.map((page: any) => ({
    id: page.id,
    staff: page.properties.Staff.rich_text[0]?.plain_text ?? '',
    message: page.properties.Message.title[0]?.plain_text ?? '',
    read: page.properties.Read.checkbox,
    createdAt: page.properties.CreatedAt.date?.start ?? '',
  }))
}

export async function getUnreadCounts(): Promise<Record<string, number>> {
  const res = await notion.databases.query({
    database_id: NOTIFICATIONS_DB,
    filter: { property: 'Read', checkbox: { equals: false } },
  })
  const counts: Record<string, number> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const page of res.results as any[]) {
    const staff = (page as any).properties.Staff.rich_text[0]?.plain_text ?? ''
    counts[staff] = (counts[staff] ?? 0) + 1
  }
  return counts
}

export async function createNotification(staff: string, message: string): Promise<void> {
  await notion.pages.create({
    parent: { database_id: NOTIFICATIONS_DB },
    properties: {
      Message: { title: [{ text: { content: message } }] },
      Staff: { rich_text: [{ text: { content: staff } }] },
      Read: { checkbox: false },
      CreatedAt: { date: { start: new Date().toISOString() } },
    },
  })
}

// ---- Staff PINs ----

export async function verifyStaffPin(name: string, pin: string): Promise<boolean> {
  const res = await notion.databases.query({
    database_id: SETTINGS_DB,
    filter: { property: 'Key', title: { equals: `pin:${name}` } },
  })
  if (res.results.length === 0) return true // PIN未設定 = 自由アクセス
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stored = (res.results[0] as any).properties.Value.rich_text[0]?.plain_text ?? ''
  return stored !== '' && stored === pin
}

export async function setStaffPin(name: string, pin: string): Promise<void> {
  await upsertSetting(`pin:${name}`, pin)
}

export async function removeStaffPin(name: string): Promise<void> {
  const res = await notion.databases.query({
    database_id: SETTINGS_DB,
    filter: { property: 'Key', title: { equals: `pin:${name}` } },
  })
  if (res.results.length > 0) {
    await notion.pages.update({ page_id: res.results[0].id, archived: true })
  }
}

export async function getStaffPinsStatus(): Promise<Record<string, boolean>> {
  const res = await notion.databases.query({ database_id: SETTINGS_DB })
  const status: Record<string, boolean> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const page of res.results as any[]) {
    const key = page.properties.Key.title[0]?.plain_text ?? ''
    const value = page.properties.Value.rich_text[0]?.plain_text ?? ''
    if (key.startsWith('pin:') && value) {
      status[key.slice(4)] = true
    }
  }
  return status
}

export async function markNotificationsRead(staff: string): Promise<void> {
  const res = await notion.databases.query({
    database_id: NOTIFICATIONS_DB,
    filter: {
      and: [
        {
          or: [
            { property: 'Staff', rich_text: { equals: staff } },
            { property: 'Staff', rich_text: { equals: 'ALL' } },
          ],
        },
        { property: 'Read', checkbox: { equals: false } },
      ],
    },
  })
  await Promise.all(
    res.results.map(page =>
      notion.pages.update({ page_id: page.id, properties: { Read: { checkbox: true } } })
    )
  )
}
