import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import { MobileNav, Sidebar, Topbar } from "@/components/shell";
import "./globals.css";

const notoThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  variable: "--font-noto-thai",
});

export const metadata: Metadata = {
  title: "Moment OS — Every Business Moments",
  description:
    "Business Moment Operating System: รู้ว่า Moment อะไรกำลังเกิดขึ้น ใครได้รับผลกระทบ และควรเสนอ Solution อะไร",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${notoThai.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-50 text-slate-900">
        <Sidebar />
        <div className="lg:pl-64">
          <Topbar />
          <main className="mx-auto max-w-[1400px] px-4 py-6 pb-24 lg:px-8 lg:pb-10">
            {children}
          </main>
        </div>
        <MobileNav />
      </body>
    </html>
  );
}
