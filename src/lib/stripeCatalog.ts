export type StripeMembershipTier = "founding" | "charter" | "member";

const DEFAULT_LOOKUP_KEYS: Record<StripeMembershipTier, string> = {
  founding: "velvet_founding_monthly",
  charter: "velvet_charter_monthly",
  member: "velvet_member_monthly",
};

function readOptionalEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  if (!value || value.includes("_xxx")) return undefined;
  return value;
}

export function tierForSignupNumber(signupNumber: number): StripeMembershipTier {
  if (signupNumber <= 100) return "founding";
  if (signupNumber <= 200) return "charter";
  return "member";
}

export function getLookupKeyForTier(tier: StripeMembershipTier): string {
  return readOptionalEnv(`STRIPE_${tier.toUpperCase()}_LOOKUP_KEY`) ?? DEFAULT_LOOKUP_KEYS[tier];
}

export function getLookupKeyForSignup(signupNumber: number): string {
  return getLookupKeyForTier(tierForSignupNumber(signupNumber));
}
