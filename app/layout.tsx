import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { IBM_Plex_Mono, Space_Grotesk } from 'next/font/google';
import { Mail, Linkedin } from 'lucide-react';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
});

export const metadata: Metadata = {
  title: 'Flipkart Review Lens',
  description: 'Browse Flipkart reviews faster, filter them instantly, and copy the original Flipkart review URL when it exists.',
  metadataBase: new URL('https://example.com'),
  openGraph: {
    title: 'Flipkart Review Lens',
    description: 'Fast Flipkart review browser with real review links and instant filters.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f172a',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${spaceGrotesk.variable} ${plexMono.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <div className="min-h-screen">
            {children}
            <footer className="mt-8 border-t border-white/10 bg-white/50 backdrop-blur-xl dark:bg-slate-950/40">
              <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Developed by Zust Dev Services</p>
                  <p className="text-xs text-muted-foreground">Fast review browsing with a lean no-database workflow.</p>
                </div>

                <div className="flex items-center gap-3">
                  <a
                    href="https://mail.google.com/mail/?view=cm&fs=1&tf=1&to=zustdevservices@gmail.com"
                    aria-label="Email Zust Dev Services"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-background/70 text-foreground shadow-sm transition-transform hover:-translate-y-0.5 hover:bg-emerald-500/10 hover:text-emerald-600 dark:bg-white/5 dark:hover:text-emerald-400"
                  >
                    <Mail className="h-4 w-4" />
                  </a>
                  <a
                    href="https://www.linkedin.com/in/zustdev-services-4b17783b2/"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="LinkedIn Zust Dev Services"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-background/70 text-foreground shadow-sm transition-transform hover:-translate-y-0.5 hover:bg-sky-500/10 hover:text-sky-600 dark:bg-white/5 dark:hover:text-sky-400"
                  >
                    <Linkedin className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </footer>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
