import type { Metadata, Viewport } from "next";
import "@fontsource-variable/newsreader";
import "@fontsource-variable/newsreader/wght-italic.css";
import "@fontsource-variable/onest";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kooper",
  description: "The quiet back office behind every great table.",
  appleWebApp: { capable: true, title: "Kooper", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = { themeColor: "#f6f1e7", width: "device-width", initialScale: 1, viewportFit: "cover", colorScheme: "light dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}