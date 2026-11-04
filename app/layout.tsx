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
      <head>
        {/* Start loading the signed-in user's data the moment the HTML arrives, in parallel with the JavaScript bundles.
            lib/store.ts picks the promise up; if it fails, the normal fetch path runs instead. */}
        <script dangerouslySetInnerHTML={{ __html: "if(location.pathname==='/'){window.__kb=fetch('/api/bootstrap',{credentials:'same-origin'}).then(function(r){return r.ok?r.json():Promise.reject(r.status)});window.__kb.catch(function(){})}" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}