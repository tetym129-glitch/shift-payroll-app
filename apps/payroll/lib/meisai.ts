// 給与明細アプリ（スタッフが自分の明細画像を取りに来る）のNotionまわり
// - 明細画像は Notion「給与明細」データベース（Key=名前|YYYY-MM, Staff, Month, Image, UploadedAt, Note）
// - スタッフのPINはシフト希望アプリと同じもの（Notion「設定」の pin:名前）をそのまま使う
// - データベースIDは公開リポジトリに書かないため、スタッフDBと同じ親ページの中から名前で探す

const NOTION = 'https://api.notion.com/v1'
const VERSION = '2022-06-28'

function headers(json = true): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
    'Notion-Version': VERSION,
  }
  if (json) h['Content-Type'] = 'application/json'
  return h
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function api(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(NOTION + path, { ...init, cache: 'no-store' })
  const body = await res.json()
  if (!res.ok) throw new Error(`Notion ${path} ${res.status} ${body?.message ?? ''}`)
  return body
}

// ---- データベースを探す ----

let parentId = ''
async function getParentId(): Promise<string> {
  if (parentId) return parentId
  const db = await api(`/databases/${process.env.NOTION_STAFF_DB_ID}`, { headers: headers(false) })
  parentId = db.parent?.page_id ?? ''
  return parentId
}

const dbCache: Record<string, string> = {}
async function findDb(title: string, props: string[]): Promise<string> {
  if (dbCache[title]) return dbCache[title]
  const parent = await getParentId()
  const res = await api('/search', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ query: title, filter: { property: 'object', value: 'database' } }),
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (res.results as any[]).find(d =>
    d.parent?.page_id === parent && props.every(p => d.properties?.[p]),
  )
  if (!db) throw new Error(`データベース「${title}」が見つかりません`)
  dbCache[title] = db.id
  return db.id
}

const meisaiDb = () => findDb('給与明細', ['Key', 'Staff', 'Month', 'Image', 'Note'])
const settingsDb = () => findDb('設定', ['Key', 'Value'])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function queryAll(dbId: string, filter: any): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = []
  let cursor: string | undefined
  do {
    const res = await api(`/databases/${dbId}/query`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ filter, ...(cursor ? { start_cursor: cursor } : {}) }),
    })
    out.push(...res.results)
    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor)
  return out
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const text = (p: any): string => (p?.rich_text ?? p?.title ?? []).map((t: any) => t.plain_text).join('')

// ---- スタッフ ----

export async function getActiveStaffNames(): Promise<string[]> {
  const res = await api(`/databases/${process.env.NOTION_STAFF_DB_ID}/query`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      filter: { property: 'Active', checkbox: { equals: true } },
      sorts: [{ property: 'Order', direction: 'ascending' }],
    }),
  })
  const names: string[] = []
  for (const page of res.results) {
    const n = text(page.properties.Name).trim()
    if (n && !names.includes(n) && !n.includes('テスト')) names.push(n)
  }
  return names
}

// ---- PIN（シフト希望アプリと同じ） ----

const MAX_FAILS = 5
const LOCK_MINUTES = 10

async function getLockPage(name: string) {
  const db = await meisaiDb()
  const res = await queryAll(db, { property: 'Key', title: { equals: `lock|${name}` } })
  return res[0] ?? null
}

// 結果: ok / wrong / nopin / locked
export async function checkStaffPin(name: string, pin: string): Promise<'ok' | 'wrong' | 'nopin' | 'locked'> {
  const names = await getActiveStaffNames()
  if (!names.includes(name)) return 'wrong'

  const lockPage = await getLockPage(name)
  let lock = { fails: 0, until: 0 }
  try { if (lockPage) lock = { ...lock, ...JSON.parse(text(lockPage.properties.Note) || '{}') } } catch { /* 壊れていたら0から */ }
  if (lock.until > Date.now()) return 'locked'

  const sdb = await settingsDb()
  const res = await queryAll(sdb, { property: 'Key', title: { equals: `pin:${name}` } })
  const stored = res.length ? text(res[0].properties.Value) : ''
  if (!stored) return 'nopin' // 明細はPINなしでは見せない

  const ok = /^\d{4}$/.test(pin) && stored === pin
  const next = ok
    ? { fails: 0, until: 0 }
    : lock.fails + 1 >= MAX_FAILS
      ? { fails: 0, until: Date.now() + LOCK_MINUTES * 60_000 }
      : { fails: lock.fails + 1, until: 0 }
  if (!ok || lock.fails > 0) await saveLock(name, lockPage?.id ?? null, next)
  if (!ok && next.until) return 'locked'
  return ok ? 'ok' : 'wrong'
}

async function saveLock(name: string, pageId: string | null, value: { fails: number; until: number }) {
  const props = { Note: { rich_text: [{ text: { content: JSON.stringify(value) } }] } }
  if (pageId) {
    await api(`/pages/${pageId}`, { method: 'PATCH', headers: headers(), body: JSON.stringify({ properties: props }) })
  } else {
    await api('/pages', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        parent: { database_id: await meisaiDb() },
        properties: {
          ...props,
          Key: { title: [{ text: { content: `lock|${name}` } }] },
          Staff: { rich_text: [{ text: { content: name } }] },
          Month: { rich_text: [{ text: { content: 'lock' } }] },
        },
      }),
    })
  }
}

// ---- 明細 ----

const MONTH_RE = /^\d{4}-\d{2}$/

export async function listMonths(name: string): Promise<string[]> {
  const res = await queryAll(await meisaiDb(), { property: 'Staff', rich_text: { equals: name } })
  const months = res
    .map(p => text(p.properties.Month))
    .filter(m => MONTH_RE.test(m))
  return Array.from(new Set(months)).sort().reverse()
}

export async function getSlipImage(name: string, month: string): Promise<ArrayBuffer | null> {
  if (!MONTH_RE.test(month)) return null
  const res = await queryAll(await meisaiDb(), { property: 'Key', title: { equals: `${name}|${month}` } })
  const file = res[0]?.properties.Image.files[0]
  const url = file?.file?.url ?? file?.external?.url
  if (!url) return null
  const img = await fetch(url, { cache: 'no-store' })
  if (!img.ok) return null
  return img.arrayBuffer()
}

// 同じ人・同じ月がもうあれば、古いほうはNotionのごみ箱へ（消さない・あとで戻せる）
export async function saveSlip(name: string, month: string, png: Buffer): Promise<void> {
  if (!MONTH_RE.test(month)) throw new Error('月の形がちがいます')
  const db = await meisaiDb()
  const key = `${name}|${month}`
  const old = await queryAll(db, { property: 'Key', title: { equals: key } })

  const filename = `${month}_${name}.png`
  const up = await api('/file_uploads', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ filename, content_type: 'image/png' }),
  })
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), filename)
  await api(`/file_uploads/${up.id}/send`, { method: 'POST', headers: headers(false), body: form })

  await api('/pages', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      parent: { database_id: db },
      properties: {
        Key: { title: [{ text: { content: key } }] },
        Staff: { rich_text: [{ text: { content: name } }] },
        Month: { rich_text: [{ text: { content: month } }] },
        Image: { files: [{ type: 'file_upload', file_upload: { id: up.id }, name: filename }] },
        UploadedAt: { date: { start: new Date().toISOString() } },
      },
    }),
  })
  for (const p of old) {
    await api(`/pages/${p.id}`, { method: 'PATCH', headers: headers(), body: JSON.stringify({ archived: true }) })
  }
}

export async function savedNamesForMonth(month: string): Promise<string[]> {
  if (!MONTH_RE.test(month)) return []
  const res = await queryAll(await meisaiDb(), { property: 'Month', rich_text: { equals: month } })
  return res.map(p => text(p.properties.Staff))
}
