"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import type { CreatorApplication } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils/format";

/**
 * Ansøgningsformular — skriver direkte via browser-klienten ala
 * SaveFilmButton: RLS tvinger user_id = auth.uid() og status =
 * 'pending', unikke-constraints håndhæver ét handle og én ansøgning
 * pr. konto. Ingen API-rute er nødvendig.
 *
 * View'et er prop-truth: server-komponenten genhentes efter hver
 * skrivning (router.refresh()), så statuskortet altid afspejler
 * databasen — ikke lokal gætværk.
 */

/** Statiske ruter skygger for /creator/[handle] — disse handles er reserverede. */
const RESERVED_HANDLES = ["apply", "studio"];

const HANDLE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const inputClassName =
  "w-full rounded-lg border border-smoke bg-onyx px-4 py-2.5 text-sm text-bone placeholder:text-ash/60 focus:border-champagne focus:outline-none";

export default function CreatorApplicationForm({
  application,
}: {
  application: CreatorApplication | null;
}) {
  const t = useTranslations("creatorApply");
  const locale = useLocale();
  const router = useRouter();
  const [name, setName] = useState(application?.name ?? "");
  const [handle, setHandle] = useState(application?.handle ?? "");
  const [bio, setBio] = useState(application?.bio ?? "");
  const [foundedYear, setFoundedYear] = useState(
    application ? String(application.foundedYear) : "",
  );
  const [country, setCountry] = useState(application?.country ?? "");
  const [motivation, setMotivation] = useState(application?.motivation ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRejected = application?.status === "rejected";

  const validateHandle = async (): Promise<string | null> => {
    const trimmed = handle.trim();
    if (
      trimmed.length < 3 ||
      trimmed.length > 40 ||
      !HANDLE_PATTERN.test(trimmed)
    ) {
      return t("handleHint");
    }
    if (RESERVED_HANDLES.includes(trimmed)) {
      return t("errors.reserved");
    }
    // Ledighed kan kun tjekkes mod eksisterende skaber-profiler
    // (offentligt læsbare) — ansøgninger fra andre kan RLS ikke vise;
    // unik-constrainten fanger dem i stedet.
    const supabase = createClient();
    const { data: taken } = await supabase
      .from("creators")
      .select("handle")
      .eq("handle", trimmed)
      .maybeSingle();
    if (taken) return t("errors.handleTaken");
    return null;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError(null);

    const year = Number(foundedYear);
    const currentYear = new Date().getFullYear();
    if (
      !name.trim() ||
      !bio.trim() ||
      !country.trim() ||
      !motivation.trim() ||
      !Number.isInteger(year) ||
      year < 1900 ||
      year > currentYear + 1
    ) {
      setError(t("errors.generic"));
      return;
    }
    const handleError = await validateHandle();
    if (handleError) {
      setError(handleError);
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setError(t("errors.generic"));
        return;
      }

      const fields = {
        name: name.trim(),
        handle: handle.trim(),
        bio: bio.trim(),
        founded_year: year,
        country: country.trim(),
        motivation: motivation.trim(),
      };

      if (isRejected) {
        // Genafsendelse: RLS tvinger rejected → pending; et tomt
        // resultat betyder, at statussen nåede at ændre sig undervejs
        // (supabase-js fejler ikke tavst på 0 rækker).
        const { data, error: updateError } = await supabase
          .from("creator_applications")
          .update({ ...fields, status: "pending" })
          .eq("user_id", session.user.id)
          .select("*")
          .single();
        if (updateError || !data) {
          setError(updateError ? t("errors.generic") : t("errors.stale"));
          return;
        }
      } else {
        const { error: insertError } = await supabase
          .from("creator_applications")
          .insert({ ...fields, user_id: session.user.id });
        if (insertError) {
          setError(insertError.code === "23505" ? t("errors.handleTaken") : t("errors.generic"));
          return;
        }
      }

      // Server-komponenten genhenter ansøgningen → view flipper
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  /* ---- Statuskort: ansøgningen er allerede sendt ---- */
  if (application && application.status !== "rejected") {
    const decided = application.status === "approved";
    return (
      <div className="rounded-xl border border-smoke bg-onyx px-6 py-8">
        <p
          className={`text-sm font-medium ${
            decided ? "text-champagne" : "text-ash"
          }`}
        >
          {decided ? t("statusApproved") : t("statusPending")}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ash">
          {decided
            ? t("statusApprovedSub")
            : t("statusPendingSub", {
                date: formatDate(application.createdAt, locale),
              })}
        </p>
        {decided && (
          <div className="mt-6">
            <Link
              href="/creator/studio"
              className="rounded-full bg-champagne px-6 py-2.5 text-xs font-medium tracking-wide text-noir transition-colors hover:bg-bone"
            >
              {t("statusApprovedCta")}
            </Link>
          </div>
        )}
      </div>
    );
  }

  const canSubmit =
    !busy &&
    name.trim().length > 0 &&
    handle.trim().length > 0 &&
    bio.trim().length > 0 &&
    foundedYear.trim().length > 0 &&
    country.trim().length > 0 &&
    motivation.trim().length > 0;

  return (
    <div className="space-y-8">
      {isRejected && application && (
        <div className="rounded-xl border border-smoke bg-onyx px-6 py-6">
          <p className="text-sm font-medium text-ash">
            {t("statusRejected")}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ash">
            {t("statusRejectedSub", {
              date: formatDate(application.decidedAt ?? Date.now(), locale),
            })}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm text-ash">{t("nameLabel")}</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              className={`mt-1.5 ${inputClassName}`}
            />
          </label>
          <label className="block">
            <span className="text-sm text-ash">{t("handleLabel")}</span>
            <input
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase())}
              maxLength={40}
              className={`mt-1.5 ${inputClassName}`}
            />
            <span className="mt-1.5 block text-xs text-ash/70">
              {t("handleHint")}
            </span>
          </label>
          <label className="block">
            <span className="text-sm text-ash">{t("countryLabel")}</span>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              maxLength={60}
              className={`mt-1.5 ${inputClassName}`}
            />
          </label>
          <label className="block">
            <span className="text-sm text-ash">{t("foundedYearLabel")}</span>
            <input
              type="number"
              value={foundedYear}
              onChange={(e) => setFoundedYear(e.target.value)}
              min={1900}
              max={new Date().getFullYear() + 1}
              className={`mt-1.5 ${inputClassName}`}
            />
          </label>
        </div>

        <label className="block">
          <span className="text-sm text-ash">{t("bioLabel")}</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
            maxLength={2000}
            className={`mt-1.5 ${inputClassName}`}
          />
        </label>

        <label className="block">
          <span className="text-sm text-ash">{t("motivationLabel")}</span>
          <textarea
            value={motivation}
            onChange={(e) => setMotivation(e.target.value)}
            rows={4}
            maxLength={2000}
            className={`mt-1.5 ${inputClassName}`}
          />
          <span className="mt-1.5 block text-xs text-ash/70">
            {t("motivationHint")}
          </span>
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-full bg-champagne px-6 py-2.5 text-sm font-medium text-noir transition-colors hover:bg-bone disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy
            ? t("working")
            : isRejected
              ? t("resubmit")
              : t("submit")}
        </button>
      </form>
    </div>
  );
}