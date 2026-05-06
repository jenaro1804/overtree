import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Overtree",
  description: "Local-first LaTeX editor with LAN collaboration",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="min-h-full bg-zinc-950 text-zinc-100 font-sans">
        {children}
      </body>
    </html>
  );
}
