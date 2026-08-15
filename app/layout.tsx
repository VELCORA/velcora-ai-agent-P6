import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";
import { SessionProvider } from "next-auth/react";

export const metadata: Metadata = {
  description:
    "Velcora AI Agent — Your intelligent business operations co-pilot. Qualify leads, draft emails, summarize meetings, research markets, and write proposals with AI.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://velcora-ai-agent-p6.vercel.app"
  ),
  title: "Velcora AI Agent",
};

export const viewport = {
  maximumScale: 1,
};

const geist = Geist({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-geist",
});

const geistMono = Geist_Mono({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

const LIGHT_THEME_COLOR = "hsl(0 0% 100%)";
const DARK_THEME_COLOR = "hsl(240deg 10% 3.92%)";
const THEME_COLOR_SCRIPT = `\
(function() {
  var html = document.documentElement;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  function updateThemeColor() {
    var isDark = html.classList.contains('dark');
    meta.setAttribute('content', isDark ? '${DARK_THEME_COLOR}' : '${LIGHT_THEME_COLOR}');
  }
  var observer = new MutationObserver(updateThemeColor);
  observer.observe(html, { attributes: true, attributeFilter: ['class'] });
  updateThemeColor();
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      className={`${geist.variable} ${geistMono.variable}`}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: "Required"
          dangerouslySetInnerHTML={{
            __html: THEME_COLOR_SCRIPT,
          }}
        />
      </head>
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          disableTransitionOnChange
          enableSystem
        >
          <SessionProvider
            basePath={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/auth`}
          >
            <TooltipProvider>{children}</TooltipProvider>
          </SessionProvider>
        </ThemeProvider>
        <footer className="border-t border-zinc-800 bg-zinc-950 py-8 px-6 text-center text-sm text-zinc-400">
          <div className="mx-auto flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6">
            <span className="font-semibold text-zinc-200">
              Contact Velcora AI
            </span>
            <a
              className="hover:text-white transition-colors"
              href="mailto:velcora.ai@gmail.com"
            >
              velcora.ai@gmail.com
            </a>
            <a
              className="hover:text-white transition-colors"
              href="tel:+919138278584"
            >
              +919138278584
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
