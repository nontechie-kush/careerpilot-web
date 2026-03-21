import { Inter } from 'next/font/google';
import './globals.css';
import Providers from '@/components/Providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'CareerPilot AI — Right Jobs. Right Referrals. 10x Faster.',
  description: 'CareerPilot scans 20+ job sites every 4 hours, finds referral paths, and drafts your applications. You just review and apply.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Pilot',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  // viewportFit=cover enables env(safe-area-inset-*) on notched iPhones
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} bg-gray-50 dark:bg-slate-950`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
