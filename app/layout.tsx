import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Overtree",
  description: "Local-first LaTeX editor with LAN collaboration",
};

// Applied before paint so a stored "light" choice doesn't flash dark first.
// Dark is the CSS default (no attribute), so we only act for light.
const noFlashTheme = `(function(){try{if(localStorage.getItem("overtree.theme")==="light"){document.documentElement.dataset.theme="light"}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashTheme }} />
      </head>
      <body className="min-h-full bg-background text-foreground font-sans">
        {children}
      </body>
    </html>
  );
}
