import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AITU College",
  description: "Расписание групп AITU College, домашние задания и учебный календарь 2026–2027.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "AITU College", statusBarStyle: "default" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/icon-192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
