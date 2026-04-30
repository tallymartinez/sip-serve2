import { createFileRoute } from "@tanstack/react-router";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function priceCentsForLookupKey(key: string | undefined | null): number | null {
  if (key === "velvet_founding_monthly") return 8000;
  if (key === "velvet_charter_monthly") return 9000;
  if (key === "velvet_member_monthly") return 10000;
  return null;
}

function tierLabelForKey(key: string | undefined | null): string {
  if (key === "velvet_founding_monthly") return "Founding Member";
  if (key === "velvet_charter_monthly") return "Charter Member";
  return "Member";
}

async function activateMember(userId: string, priceId: string | null, signupNumber: number | null) {
  const cents = priceCentsForLookupKey(priceId);
  await supabaseAdmin
    .from("profiles")
    .update({
      subscription_status: "active",
      subscription_started_at: new Date().toISOString(),
      ...(cents !== null && { subscription_price_cents: cents }),
      ...(signupNumber !== null && { signup_number: signupNumber }),
    })
    .eq("id", userId);

  // Send welcome email if email infrastructure is set up.
  // (Wrapped in try/catch so missing email setup doesn't block activation.)
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email, full_name")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.email) {
      await supabaseAdmin.rpc("enqueue_email" as any, {
        queue_name: "transactional_emails",
        message: {
          template_name: "welcome-velvet",
          recipient_email: profile.email,
          template_data: {
            name: (profile.full_name as string) || null,
            tier: tierLabelForKey(priceId),
          },
          idempotency_key: `welcome-${userId}`,
        },
      });
    }
  } catch (e) {
    console.warn("Welcome email enqueue skipped:", e);
  }
}

async function handleSubscriptionCreated(subscription: any, env: StripeEnv) {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.error("No userId in subscription metadata");
    return;
  }

  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.metadata?.lovable_external_id || item?.price?.id;
  const productId = item?.price?.product;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;
  const signupNumberRaw = subscription.metadata?.signupNumber;
  const signupNumber = signupNumberRaw ? Number(signupNumberRaw) : null;

  await supabaseAdmin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer,
      product_id: productId,
      price_id: priceId,
      status: subscription.status,
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      environment: env,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );

  if (["active", "trialing"].includes(subscription.status)) {
    await activateMember(userId, priceId, signupNumber);
  }
}

async function handleSubscriptionUpdated(subscription: any, env: StripeEnv) {
  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.metadata?.lovable_external_id || item?.price?.id;
  const productId = item?.price?.product;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;

  await supabaseAdmin
    .from("subscriptions")
    .update({
      status: subscription.status,
      product_id: productId,
      price_id: priceId,
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end || false,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id)
    .eq("environment", env);

  // Reflect status onto profile so the UI shows / hides the paywall correctly.
  // Cancel-at-period-end stays "active" until period actually ends.
  const userId = subscription.metadata?.userId;
  if (userId) {
    const profileStatus =
      ["active", "trialing"].includes(subscription.status)
        ? "active"
        : subscription.status === "past_due"
          ? "past_due"
          : subscription.status === "canceled"
            ? "cancelled"
            : subscription.status;
    await supabaseAdmin
      .from("profiles")
      .update({ subscription_status: profileStatus })
      .eq("id", userId);
  }
}

async function handleSubscriptionDeleted(subscription: any, env: StripeEnv) {
  await supabaseAdmin
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscription.id)
    .eq("environment", env);

  const userId = subscription.metadata?.userId;
  if (userId) {
    await supabaseAdmin
      .from("profiles")
      .update({ subscription_status: "cancelled" })
      .eq("id", userId);
  }
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);

  switch (event.type) {
    case "customer.subscription.created":
      await handleSubscriptionCreated(event.data.object, env);
      break;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event.data.object, env);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object, env);
      break;
    default:
      console.log("Unhandled event:", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("Webhook received with invalid env:", rawEnv);
          return Response.json({ received: true, ignored: "invalid env" });
        }
        const env: StripeEnv = rawEnv;
        try {
          await handleWebhook(request, env);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});