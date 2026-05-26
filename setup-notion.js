/**
 * Notionデータベースを自動作成するセットアップスクリプト
 * 使い方: NOTION_API_KEY=xxx node setup-notion.js <親ページのID>
 */

const { Client } = require('@notionhq/client')
const fs = require('fs')

const apiKey = process.env.NOTION_API_KEY
const parentPageId = process.argv[2]

if (!apiKey) {
  console.error('❌ NOTION_API_KEY が設定されていません')
  console.error('   NOTION_API_KEY=secret_xxx node setup-notion.js <ページID>')
  process.exit(1)
}

if (!parentPageId) {
  console.error('❌ 親ページのIDを引数で指定してください')
  console.error('   例: node setup-notion.js abc123def456...')
  console.error('')
  console.error('   ページIDの確認方法:')
  console.error('   NotionでページをブラウザCで開き、URLの末尾32文字がIDです')
  console.error('   例: https://notion.so/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')
  process.exit(1)
}

const notion = new Client({ auth: apiKey })

async function createDB(title, properties) {
  const db = await notion.databases.create({
    parent: { type: 'page_id', page_id: parentPageId },
    title: [{ type: 'text', text: { content: title } }],
    properties,
  })
  return db.id
}

async function main() {
  console.log('📦 Notion データベースを作成中...\n')

  const staffDbId = await createDB('スタッフ', {
    Name:   { title: {} },
    Active: { checkbox: {} },
    Order:  { number: { format: 'number' } },
  })
  console.log(`✅ スタッフ DB 作成完了`)

  const shiftsDbId = await createDB('シフト希望', {
    Name:        { title: {} },
    Staff:       { rich_text: {} },
    Period:      { rich_text: {} },
    ShiftsData:  { rich_text: {} },
    SubmittedAt: { date: {} },
    UpdatedAt:   { date: {} },
  })
  console.log(`✅ シフト希望 DB 作成完了`)

  const settingsDbId = await createDB('設定', {
    Key:   { title: {} },
    Value: { rich_text: {} },
  })
  console.log(`✅ 設定 DB 作成完了`)

  const notificationsDbId = await createDB('通知', {
    Message:   { title: {} },
    Staff:     { rich_text: {} },
    Read:      { checkbox: {} },
    CreatedAt: { date: {} },
  })
  console.log(`✅ 通知 DB 作成完了`)

  const envContent = [
    `NOTION_API_KEY=${apiKey}`,
    `NOTION_STAFF_DB_ID=${staffDbId}`,
    `NOTION_SHIFTS_DB_ID=${shiftsDbId}`,
    `NOTION_SETTINGS_DB_ID=${settingsDbId}`,
    `NOTION_NOTIFICATIONS_DB_ID=${notificationsDbId}`,
    `ADMIN_PIN=1234`,
  ].join('\n')

  fs.writeFileSync('.env.local', envContent)

  console.log('\n🎉 完了！.env.local を作成しました\n')
  console.log('次のステップ:')
  console.log('  1. npm run dev でローカル動作確認')
  console.log('  2. Vercel にデプロイして環境変数を設定')
  console.log('')
  console.log('⚠️  管理者PINは現在 1234 です。Vercelの環境変数 ADMIN_PIN で変更してください。')
}

main().catch(err => {
  console.error('❌ エラーが発生しました:', err.message)
  process.exit(1)
})
