import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MyZ Sync Portal",
  description: "Manage MyZ Annotator accounts and synchronization",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-slate-950 text-slate-50 antialiased`}
      >
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
          <header className="border-b border-white/10 bg-black/40 backdrop-blur">
            <nav className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
              <div className="text-lg font-semibold tracking-wide text-white">
                MyZ Sync Service
              </div>
              <div className="flex items-center gap-4 text-sm text-white/70">
                <a href="/" className="hover:text-white">Home</a>
                <a href="/dashboard" className="hover:text-white">Dashboard</a>
                <a href="/login" className="hover:text-white">Login</a>
                <a href="/register" className="hover:text-white">Register</a>
              </div>
            </nav>
          </header>
          <main className="mx-auto w-full max-w-5xl px-6 py-10">{children}</main>
          <footer className="border-t border-white/10 bg-black/40 py-6 text-center text-xs text-white/50">
            &copy; {new Date().getFullYear()} MyZ Annotator Service
          </footer>
        </div>
      </body>
    </html>
  );
}
