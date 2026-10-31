import type { Metadata, Viewport } from "next";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/figtree";
// @ts-expect-error CSS is handled by Next.js, but its side-effect import is not declared to TypeScript.
import "./globals.css";

export const metadata: Metadata = {
  title: "Kooper",
  description: "Your pocket restaurant operations assistant.",
  appleWebApp: { capable: true, title: "Kooper", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = { themeColor: "#2a1740", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}