"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

interface PasswordInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
}

/**
 * Adgangskode-felt med "øje" — man skal kunne se, hvad man taster
 * (især ved ny-adgangskode-formularer, hvor gen-indtastningen skal
 * stemme). Knappen flipper kun type lokalt; autoComplete sætter
 * forælderen, så browserens adgangskode-hukommelse stadig virker.
 * Alle adgangskode-felter i projektet er required med minLength 6,
 * så det er bagt ind her.
 */
export default function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
}: PasswordInputProps) {
  const t = useTranslations("auth");
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative mt-2">
      <input
        id={id}
        type={visible ? "text" : "password"}
        required
        minLength={6}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-smoke bg-noir px-4 py-2.5 pr-12 text-sm text-bone placeholder:text-ash/50 transition-colors focus:border-champagne/60 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        aria-label={visible ? t("hidePassword") : t("showPassword")}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-ash transition-colors hover:text-bone"
      >
        {visible ? (
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
            <circle cx="12" cy="12" r="3" />
            <path d="M4 4l16 16" />
          </svg>
        )}
      </button>
    </div>
  );
}