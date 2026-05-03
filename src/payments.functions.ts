import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { type StripeEnv, createStripeClient } from "@/lib/stripe.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function tierPriceIdFor(signupNumber: number): string {
  if (signupNumber <= 100) return "velvet_founding_monthly";
  if (signupNumber <= 200) return "velvet_charter_monthly";
  return "velvet_member_monthly";
}

async function getUserFromToken(accessToken: string) {
  const sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await sb.auth.getUser(accessToken);
  if (error || !data.user) throw new Error("Unauthorized");
  return data.user;
}

export const createMembershipCheckout = createServerFn({ method: "POST" })
  .inputValidator((d: { accessToken: string; returnUrl: string; environment: StripeEnv }) => d)
  .handler(async ({ data }) => {
    const user = await getUserFromToken(data.accessToken);

    const { data: existing } = await supabaseAdmin
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("user_id", user.id)
      .eq("environment", data.environment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (
      existing &&
      ((["active", "trialing", "past_due"].includes(existing.status as string) &&
        (!existing.current_period_end || new Date(existing.current_period_end as string) > new Date())) ||
        (existing.status === "canceled" &&
          existing.current_period_end &&
          new Date(existing.current_period_end as string) > new Date()))
    ) {
      throw new Error("You're already an active member.");
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email, full_name, signup_number")
      .eq("id", user.id)
      .single();

    if (!profile) throw new Error("Profile not found");

    const priceId = tierPriceIdFor(profile.signup_number ?? 1);

    const stripe = createStripeClient(data.environment);
    const prices = await stripe.prices.list({ lookup_keys: [priceId] });
    if (!prices.data.length) throw new Error(`Price not found: ${priceId}`);
    const stripePrice = prices.data[0];

    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: stripePrice.id, quantity: 1 }],
      mode: "subscription",
      ui_mode: "embedded_page",
      return_url: data.returnUrl,
      customer_email: profile.email ?? user.email ?? undefined,
      managed_payments: { enabled: true } as any,
      metadata: {
        userId: user.id,
        priceId,
        signupNumber: String(profile.signup_number ?? ""),
      },
      subscription_data: {
        metadata: {
          userId: user.id,
          priceId,
          signupNumber: String(profile.signup_number ?? ""),
        },
      },
    });

    return session.client_secret;
  });

export const createBillingPortalSession = createServerFn({ method: "POST" })
  .inputValidator((d: { accessToken: string; returnUrl: string; environment: StripeEnv }) => d)
  .handler(async ({ data }) => {
    const user = await getUserFromToken(data.accessToken);

    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .eq("environment", data.environment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub?.stripe_customer_id) throw new Error("No subscription found");

    const stripe = createStripeClient(data.environment);
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id as string,
      return_url: data.returnUrl,
    });
    return portal.url;
  });
