import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '給料計算',
  description: 'オーナー専用給料計算アプリ',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body className="bg-gray-50">
        {children}
      </body>
    </html>
  )
}
