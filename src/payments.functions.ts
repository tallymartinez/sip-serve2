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

export const toggleMembershipRenewal = createServerFn({ method: "POST" })
  .inputValidator((d: { accessToken: string; targetUserId: string; environment: StripeEnv }) => d)
  .handler(async ({ data }) => {
    const actor = await getUserFromToken(data.accessToken);

    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from("profiles")
      .select("id, company_id")
      .eq("id", data.targetUserId)
      .maybeSingle();

    if (targetError || !targetProfile) throw new Error("Target member not found");

    const [{ data: roles }, { data: ownedCompanies }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("role, company_id").eq("user_id", actor.id),
      supabaseAdmin.from("companies").select("id").eq("owner_user_id", actor.id),
    ]);

    const companyId = targetProfile.company_id;
    const authorized =
      (roles ?? []).some((role) => role.role === "super_admin") ||
      (!!companyId &&
        (
          (roles ?? []).some((role) => role.role === "admin" && role.company_id === companyId) ||
          (ownedCompanies ?? []).some((company) => company.id === companyId)
        ));

    if (!authorized) throw new Error("Not authorized to manage this membership");

    const { data: subscription, error: subscriptionError } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_subscription_id, cancel_at_period_end, current_period_end, status")
      .eq("user_id", data.targetUserId)
      .eq("environment", data.environment)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subscriptionError) throw subscriptionError;
    if (!subscription?.stripe_subscription_id) throw new Error("No paid Stripe subscription found for this member");

    const stripe = createStripeClient(data.environment);
    const nextCancelAtPeriodEnd = !Boolean(subscription.cancel_at_period_end);
    const updated = await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      cancel_at_period_end: nextCancelAtPeriodEnd,
    });

    const item = updated.items?.data?.[0];
    const periodEnd = item?.current_period_end ?? updated.current_period_end;

    await supabaseAdmin
      .from("subscriptions")
      .update({
        status: updated.status,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancel_at_period_end: updated.cancel_at_period_end || false,
        updated_at: new Date().toISOString(),
      })
      .eq("stripe_subscription_id", updated.id)
      .eq("environment", data.environment);

    await supabaseAdmin
      .from("profiles")
      .update({
        subscription_status: ["active", "trialing", "past_due"].includes(updated.status) ? "active" : updated.status,
      })
      .eq("id", data.targetUserId);

    return {
      cancelAtPeriodEnd: updated.cancel_at_period_end || false,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      status: updated.status,
    };
  });
