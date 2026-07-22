import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#0c1015",
    description:
      "A private, self-hosted feed from administrator-selected sources.",
    display: "standalone",
    icons: [
      {
        purpose: "any",
        sizes: "192x192",
        src: "/icons/mirthspool-192.png",
        type: "image/png",
      },
      {
        purpose: "maskable",
        sizes: "512x512",
        src: "/icons/mirthspool-512.png",
        type: "image/png",
      },
    ],
    id: "/",
    name: "MirthSpool",
    orientation: "any",
    scope: "/",
    short_name: "MirthSpool",
    start_url: "/",
    theme_color: "#0c1015",
  };
}
