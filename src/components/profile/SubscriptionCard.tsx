import { getLocale, getTranslations } from "next-intl/server";
import type { SubscriptionPlan, UserProfile } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils/format";

/**
 * Abonnementskort. Plannavnet og perks vises fra beskedefilerne
 * (`plans.<tier>`) — plans.ts er kun datakilde for pris/nøgler.
 */
export default async function SubscriptionCard({
  user,
  plan,
}: {
  user: UserProfile;
  plan: SubscriptionPlan;
}) {
  const t = await getTranslations("subscriptionCard");
  const plansT = await getTranslations("plans");
  const locale = await getLocale();
  const perks = plansT.raw(`${plan.tier}.perks`) as string[];

  return (
    <div className="rounded-xl border border-champagne/30 bg-linear-to-br from-onyx to-noir p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-champagne">
            {t("label")}
          </p>
          <h3 className="mt-2 font-display text-3xl text-bone">
            {plansT(`${plan.tier}.name`)}
          </h3>
          <p className="mt-1 text-sm text-ash">
            {t("memberSince", { date: formatDate(user.memberSince, locale) })}
          </p>
        </div>
        <p className="font-display text-2xl text-champagne">
          {plan.priceDkkPerMonth === 0
            ? t("free")
            : `${formatCurrency(plan.priceDkkPerMonth, locale)}${t("perMonth")}`}
        </p>
      </div>
      <ul className="mt-6 space-y-2">
        {perks.map((perk) => (
          <li key={perk} className="flex items-start gap-3 text-sm text-bone/85">
            <span className="mt-0.5 text-champagne">✓</span>
            {perk}
          </li>
        ))}
      </ul>
    </div>
  );
}