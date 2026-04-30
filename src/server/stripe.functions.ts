import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import Stripe from "stripe";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key);
}

function originFromRequest() {
  const proto = getRequestHeader("x-forwarded-proto") || "https";
  const host = getRequestHost();
  return `${proto}://${host}`;
}

export const createCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;
    const stripe = getStripe();

    // Load profile to get/lock the price
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, full_name, stripe_customer_id, subscription_status, subscription_price_cents, signup_number")
      .eq("id", userId)
      .single();

    if (!profile) throw new Error("Profile not found");
    if (profile.subscription_status === "active") {
      throw new Error("Already an active member");
    }

    // Lock the price at checkout time using the user's signup_number
    const { data: priceCentsData } = await supabaseAdmin.rpc("tier_price_for_signup", {
      _n: profile.signup_number ?? 1,
    });
    const priceCents = (priceCentsData as number) ?? 8000;

    // Create or reuse Stripe customer
    let customerId = profile.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email ?? (claims.email as string | undefined),
        name: profile.full_name || undefined,
        metadata: { user_id: userId },
      });
      customerId = customer.id;
      await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", userId);
    }

    const origin = originFromRequest();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: "Velvet Club Membership" },
            recurring: { interval: "month" },
            unit_amount: priceCents,
          },
          quantity: 1,
        },
      ],
      metadata: { user_id: userId, locked_price_cents: String(priceCents) },
      subscription_data: {
        metadata: { user_id: userId, locked_price_cents: String(priceCents) },
      },
      success_url: `${origin}/dashboard?checkout=success`,
      cancel_url: `${origin}/dashboard?checkout=cancel`,
    });

    return { url: session.url };
  });

export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const stripe = getStripe();

    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .single();

    if (!profile?.stripe_customer_id) {
      throw new Error("No Stripe customer for this account yet");
    }

    const origin = originFromRequest();
    const portal = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/dashboard`,
    });
    return { url: portal.url };
  });