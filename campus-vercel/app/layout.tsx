import type { Metadata } from "next";
import "./globals.css";
import "./grades.css";
import "./portal.css";
import {PortalProvider} from "./portal-provider";

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
    <html lang="ru" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{__html:`try{var t=localStorage.getItem('aitu-theme')||'system';document.documentElement.dataset.theme=t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}`}}/></head>
      <body className="antialiased"><PortalProvider>{children}</PortalProvider></body>
    </html>
  );
}
