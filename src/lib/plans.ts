// Nizafa plan catalogue — same plans as the original app.
// Free / Pro Rs 2,499 / Team Rs 7,499 (PKR; USD shown as reference).
export type PlanId = "free" | "pro" | "team";

export type Plan = {
  id: PlanId;
  name: string;
  pricePkr: number;
  priceUsd: number;
  tagline: string;
  features: string[];
};

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    pricePkr: 0,
    priceUsd: 0,
    tagline: "Try Nizafa on your own channel.",
    features: [
      "1 connected channel",
      "SEO pack generator (titles, tags, hashtags)",
      "Thumbnail Studio (canvas composer)",
      "Daily trending keywords (US + Pakistan)",
      "1 saved package at a time",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    pricePkr: 2499,
    priceUsd: 9,
    tagline: "For serious creators growing one channel.",
    features: [
      "Everything in Free",
      "Unlimited saved packages",
      "Full SEO packs (script outline + thumbnail concepts)",
      "Channel audit + competitor tracking (3 channels)",
      "Trend alerts + best time to post",
      "Nizafa Assistant chat",
    ],
  },
  {
    id: "team",
    name: "Team",
    pricePkr: 7499,
    priceUsd: 27,
    tagline: "For teams and agencies running many channels.",
    features: [
      "Everything in Pro",
      "Unlimited channels + team members",
      "API access",
      "Priority support",
    ],
  },
];

export function planById(id: string): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}

/** Referral code for a user: NIZAFA- + 8 chars from the user id. */
export function referralCodeFor(userId: string): string {
  const clean = userId.replace(/-/g, "").toUpperCase().slice(0, 8);
  return `NIZAFA-${clean}`;
}
