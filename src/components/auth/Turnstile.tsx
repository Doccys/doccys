"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
    __turnstileOnload?: () => void;
  }
}

/**
 * Cloudflare Turnstile-widget (app-niveau CAPTCHA på signup/reset).
 *
 * Kører KUN når NEXT_PUBLIC_TURNSTILE_SITE_KEY er sat — uden nøgler
 * renderes ingenting, og formularen opfører sig som før (graceful).
 * Nøglerne oprettes i Cloudflare-dashboardet (Turnstile → Add site,
 * "Managed" — gratis). Token-verifikationen sker server-side i
 * /api/auth/signup og /api/auth/reset (se lib/auth/turnstile.ts).
 *
 * Nulstil-mønstret: parent remounter via key-prop (tokenet er
 * engangs — efter en server-afvisning skal widgetten give et friskt).
 */
export default function Turnstile({
  onToken,
}: {
  onToken: (token: string | null) => void;
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
  const holderRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const cbRef = useRef(onToken);
  cbRef.current = onToken;

  useEffect(() => {
    if (!siteKey || !holderRef.current) return;
    let cancelled = false;

    const render = () => {
      if (
        cancelled ||
        !window.turnstile ||
        !holderRef.current ||
        widgetIdRef.current !== null
      ) {
        return;
      }
      widgetIdRef.current = window.turnstile.render(holderRef.current, {
        sitekey: siteKey,
        theme: "dark",
        callback: (token: string) => cbRef.current(token),
        "expired-callback": () => cbRef.current(null),
        "error-callback": () => cbRef.current(null),
      });
    };

    if (window.turnstile) {
      render();
    } else {
      // Scriptet loads én gang pr. sidevisning; onload-knuden kalder
      // render (api.js?render=explicit&onload=... mønstret).
      window.__turnstileOnload = render;
      const script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__turnstileOnload";
      script.async = true;
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  if (!siteKey) return null;

  return <div ref={holderRef} className="mt-5 flex justify-center" />;
}
