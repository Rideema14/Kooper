import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kooper", short_name: "Kooper", description: "The quiet back office behind every great table.",
    start_url: "/", display: "standalone", orientation: "any", background_color: "#0a1411", theme_color: "#f6f1e7",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
