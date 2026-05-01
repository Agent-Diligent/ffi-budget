import type { Metadata } from 'next'
import './globals.css'
import Nav from '@/components/Nav'

export const metadata: Metadata = {
  title: 'FFI Budget',
  description: 'Freedom Foundation Industries Budget Tracker',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-text-primary">
        <Nav />
        <main>{children}</main>
      </body>
    </html>
  )
}
