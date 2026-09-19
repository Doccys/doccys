"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatCurrency, formatDate } from "@/lib/utils/format";

/** min. beløb for en anmodning — skal matche API + DB-check */
const PAYOUT_THRESHOLD_DKK = 150;

export type PayoutMethod = {
  iban: string | null;
  bic: string | null;
};

export type PayoutRequest = {
  id: string;
  amountDkk: number;
  status: "pending" | "paid" | "rejected";
  createdAt: string;
  processedAt: string | null;
};

interface PayoutPanelProps {
  /** bruges til ejerskabs-tjekket i POST /api/payouts */
  creatorHandle: string;
  availableDkk: number;
  /** server-renderet starttilstand — ingen tom-flash */
  initialMethod: PayoutMethod | null;
  initialRequests: PayoutRequest[];
}

/**
 * Selvbetjent udbetaling for creatorens egen profil-side: bank-
 * oplysninger gemmes af creatoren selv (RLS: kun egen række), og
 * "Udbetal"-knappen opretter en anmodning, når saldoen er >= 150 kr.
 * Den faktiske pengeoverførsel foretager redaktionen manuelt — her
 * er der kun tale om en kø, creatoren aldrig kan kvittere selv.
 */
export default function PayoutPanel({
  creatorHandle,
  availableDkk,
  initialMethod,
  initialRequests,
}: PayoutPanelProps) {
  const t = useTranslations("payoutPanel");
  const locale = useLocale();

  const [iban, setIban] = useState(initialMethod?.iban ?? "");
  const [bic, setBic] = useState(initialMethod?.bic ?? "");
  const [method, setMethod] = useState<PayoutMethod | null>(initialMethod);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const [requests, setRequests] = useState<PayoutRequest[]>(initialRequests);
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const hasPending = requests.some((r) => r.status === "pending");
  const canPayout =
    availableDkk >= PAYOUT_THRESHOLD_DKK && method !== null && !hasPending;

  async function handleSaveMethod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSavedMsg(null);
    try {
      const res = await fetch("/api/payouts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iban: iban || undefined, bic: bic || undefined }),
      });
      const data = (await res.json()) as { method?: PayoutMethod; error?: string };
      if (!res.ok || !data.method) {
        setSaveError(data.error ?? t("saveError"));
        return;
      }
      setMethod(data.method);
      setSavedMsg(t("saved"));
    } catch {
      setSaveError(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function handlePayout() {
    setRequesting(true);
    setRequestError(null);
    try {
      const res = await fetch("/api/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorHandle }),
      });
      const data = (await res.json()) as { request?: PayoutRequest; error?: string };
      if (!res.ok || !data.request) {
        setRequestError(data.error ?? t("requestError"));
        return;
      }
      setRequests((prev) => [data.request as PayoutRequest, ...prev]);
    } catch {
      setRequestError(t("requestError"));
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div
      id="udbetaling"
      className="scroll-mt-24 rounded-xl border border-smoke bg-onyx p-8"
    >
      <p className="text-xs uppercase tracking-[0.35em] text-champagne">
        {t("eyebrow")}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-ash">{t("intro")}</p>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        {/* Bankoplysninger */}
        <form onSubmit={handleSaveMethod} className="space-y-4">
          <h3 className="font-display text-lg text-bone">{t("methodTitle")}</h3>
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-ash">
              {t("iban")}
            </span>
            <input
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              maxLength={34}
              placeholder="GB82 WEST 1234 5698 7654 32"
              className="mt-1 w-full rounded-lg border border-smoke bg-noir px-4 py-2.5 text-sm text-bone placeholder:text-ash/60 focus:border-champagne focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-ash">
              {t("bic")}
            </span>
            <input
              value={bic}
              onChange={(e) => setBic(e.target.value)}
              maxLength={11}
              placeholder="DABADKKK"
              className="mt-1 w-full rounded-lg border border-smoke bg-noir px-4 py-2.5 text-sm uppercase text-bone placeholder:text-ash/60 focus:border-champagne focus:outline-none"
            />
          </label>
          <p className="text-xs leading-relaxed text-ash">{t("methodHint")}</p>
          <p className="text-xs leading-relaxed text-ash/80">{t("bicHint")}</p>

          {saveError && <p className="text-sm text-red-400">{saveError}</p>}
          {savedMsg && <p className="text-sm text-champagne">{savedMsg}</p>}

          <button
            type="submit"
            disabled={saving}
            className="rounded-full border border-champagne/60 px-5 py-2 text-sm font-medium text-champagne transition-colors hover:bg-champagne hover:text-noir disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? t("saving") : t("save")}
          </button>
        </form>

        {/* Udbetalingsknap + anmodninger */}
        <div className="space-y-5">
          <h3 className="font-display text-lg text-bone">{t("payoutTitle")}</h3>

          {availableDkk < PAYOUT_THRESHOLD_DKK && (
            <p className="text-sm text-ash">{t("locked")}</p>
          )}
          {availableDkk >= PAYOUT_THRESHOLD_DKK && !method && (
            <p className="text-sm text-ash">{t("noMethod")}</p>
          )}
          {hasPending && <p className="text-sm text-ash">{t("pending")}</p>}

          {requestError && <p className="text-sm text-red-400">{requestError}</p>}

          <button
            type="button"
            onClick={() => void handlePayout()}
            disabled={!canPayout || requesting}
            className="rounded-full bg-champagne px-6 py-2.5 text-sm font-medium text-noir transition-colors hover:bg-bone disabled:cursor-not-allowed disabled:opacity-40"
          >
            {requesting
              ? t("requesting")
              : t("button", { amount: formatCurrency(availableDkk, locale) })}
          </button>

          <div>
            <p className="text-xs uppercase tracking-widest text-ash">
              {t("history")}
            </p>
            {requests.length === 0 ? (
              <p className="mt-2 text-sm text-ash/70">{t("empty")}</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {requests.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-baseline justify-between gap-3 rounded-lg border border-smoke bg-noir px-4 py-2.5 text-sm"
                  >
                    <span className="tabular-nums text-bone">
                      {formatCurrency(r.amountDkk, locale)}
                      <span className="ml-2 text-xs text-ash/70">
                        {formatDate(Date.parse(r.createdAt), locale)}
                      </span>
                    </span>
                    <span className="flex items-baseline gap-4">
                      {/* kvittering = "indbakken": PDF genereres on-the-fly
                          pr. gennemført udbetaling, intet gemmes */}
                      {r.status === "paid" && (
                        <a
                          href={`/api/payouts/${r.id}/kvittering`}
                          className="text-champagne underline decoration-champagne/40 underline-offset-4 transition-colors hover:decoration-champagne"
                        >
                          {t("receipt")}
                        </a>
                      )}
                      <span
                        className={
                          r.status === "paid"
                            ? "text-champagne"
                            : r.status === "rejected"
                              ? "text-red-400"
                              : "text-ash"
                        }
                      >
                        {r.status === "paid"
                          ? t("paidLabel")
                          : r.status === "rejected"
                            ? t("rejectedLabel")
                            : t("pendingLabel")}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}