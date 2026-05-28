'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [authed, setAuthed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isAuthed = sessionStorage.getItem('payrollAuthed') === '1'
      setAuthed(isAuthed)
      setLoading(false)
      if (!isAuthed) {
        router.push('/')
      }
    }
  }, [router])

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">読込中...</div>
  }

  if (!authed) {
    return null
  }

  return children
}
