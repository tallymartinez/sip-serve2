import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { type StripeEnv, createStripeClient } from "@/lib/stripe.server";
import { getLookupKeyForSignup } from "@/lib/stripeCatalog";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

    const priceLookupKey = getLookupKeyForSignup(profile.signup_number ?? 1);

    const stripe = createStripeClient(data.environment);
    const prices = await stripe.prices.list({ lookup_keys: [priceLookupKey] });
    if (!prices.data.length) throw new Error(`Price not found for lookup key: ${priceLookupKey}`);
    const stripePrice = prices.data[0];

    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: stripePrice.id, quantity: 1 }],
      mode: "subscription",
      ui_mode: "embedded_page",
      redirect_on_completion: "always",
      return_url: data.returnUrl,
      customer_email: profile.email ?? user.email ?? undefined,
      metadata: {
        userId: user.id,
        priceId: stripePrice.id,
        priceLookupKey,
        signupNumber: String(profile.signup_number ?? ""),
      },
      subscription_data: {
        metadata: {
          userId: user.id,
          priceId: stripePrice.id,
          priceLookupKey,
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
