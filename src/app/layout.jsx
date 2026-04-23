import { Inter } from 'next/font/google';
import { Suspense } from 'react';
import './globals.css';
import Providers from '@/components/Providers';
import { Analytics } from '@vercel/analytics/react';
import PostHogProvider from '@/components/PostHogProvider';

const GA_ID = 'G-S84XLE50EG';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'CareerPilot AI — Right Jobs. Right Outreach. 10x Faster.',
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
      <head>
        <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} />
        <script dangerouslySetInnerHTML={{ __html: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}', { send_page_view: false });
          window.rp_track = function(event, props) {
            if (typeof gtag === 'undefined') return;
            gtag('event', event, props || {});
          };
        `}} />
      </head>
      <body className={`${inter.className} bg-gray-50 dark:bg-slate-950`}>
        <Providers>
          {children}
        </Providers>
        <Analytics />
        <Suspense fallback={null}>
          <PostHogProvider />
        </Suspense>
      </body>
    </html>
  );
}
