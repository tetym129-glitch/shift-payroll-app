import { Client } from '@notionhq/client'
import type { StaffMember } from './types'

const notion = new Client({ auth: process.env.NOTION_API_KEY })
const STAFF_DB = process.env.NOTION_STAFF_DB_ID!

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
