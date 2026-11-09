import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: '給与明細 | 蕎麦庵sio',
  description: 'スタッフが自分の給与明細を見て保存するページ',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f6f3ee',
}

export default function MeisaiLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#f6f3ee] text-stone-800">{children}</div>
}
