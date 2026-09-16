/**
 * Abonnementsplaner — statisk indhold (ikke brugerdata), indtil
 * faktisk billing/plan-valg kobles på. Hver ny konto starter på "free".
 */
import type { SubscriptionPlan, SubscriptionTier } from "@/lib/types";

export const SUBSCRIPTION_PLANS: Record<SubscriptionTier, SubscriptionPlan> = {
  free: {
    tier: "free",
    name: "Gratis",
    priceDkkPerMonth: 0,
    perks: ["Se tre film om måneden", "Kommentér under filmene", "Ingen reklamer — heller ikke her"],
  },
  "doccys-plus": {
    tier: "doccys-plus",
    name: "Doccys+",
    priceDkkPerMonth: 79,
    perks: [
      "Ubegrænset adgang til hele kataloget",
      "Gem film og fortsæt hvor du slap",
      "Støt skaberne direkte via pay-per-completion",
      "Ingen reklamer — nogensinde",
    ],
  },
  patron: {
    tier: "patron",
    name: "Patron",
    priceDkkPerMonth: 199,
    perks: [
      "Alt i Doccys+",
      "Tidlig adgang til nye premiere",
      "Bag-scenen-materiale og instruktørkommentarer",
      "Dit navn i rulleteksterne på udvalgte film",
    ],
  },
};