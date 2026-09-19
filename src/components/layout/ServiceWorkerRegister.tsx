"use client";

import { useEffect } from "react";

/**
 * Registrerer /sw.js (den minimale service worker, der gør Doccys
 * installérbar i Chrome/Edge). Registreringen er ren opportunisme:
 * fejler den — gammel browser, privat tilstand, blokeret — mærker
 * seeren intet. Vi registrerer KUN i production: i dev giver en SW
 * kun forvirring (gamle handlers hængende efter reload).
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
      return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* Installation er et tilbud, aldrig en fejl — ignorér stille. */
    });
  }, []);

  return null;
}