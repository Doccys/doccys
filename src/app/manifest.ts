import type { MetadataRoute } from "next";

/**
 * Web App Manifest — gør Doccys installerbar ("Føj til startskærm"
 * på telefonen: et ikon, der åbner siden i fuldskærm uden browser-
 * chrome, altså "app-følelse" uden en native app).
 *
 * Ruten serves som /manifest.webmanifest (punktum i stien → uden om
 * next-intl-middleware). start_url er "/" — middleware redirecter
 * derfra til seerens locale (/da, /de, ...) som på ethvert andet
 * besøg. Beskrivelsen er dansk (dansk er sidens canonical-sprog);
 * manifestet er globalt og kan ikke lokaliseres pr. seer.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Doccys",
    short_name: "Doccys",
    description:
      "Reklamefri streamingtjeneste for uafhængige dokumentarer — betal kun for de minutter, du faktisk ser.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "da",
    background_color: "#08080a",
    theme_color: "#08080a",
    categories: ["entertainment"],
    icons: [
      {
        src: "/app-icons/192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/app-icons/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // Maskable-varianten: Android beskærer ikonet i forskellige
      // former (cirkel, squircle) — markedets margen bærer det.
      {
        src: "/app-icons/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}