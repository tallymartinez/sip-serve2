import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_SECRET_KEY;
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) return new Response("Stripe not configured", { status: 500 });

        const stripe = new Stripe(secret);
        const sig = request.headers.get("stripe-signature");
        const body = await request.text();

        let event: Stripe.Event;
        try {
          if (webhookSecret && sig) {
            event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
          } else {
            // No webhook secret configured yet — accept unsigned (dev only)
            event = JSON.parse(body) as Stripe.Event;
          }
        } catch (err) {
          console.error("Webhook signature verification failed", err);
          return new Response("Invalid signature", { status: 400 });
        }

        try {
          switch (event.type) {
            case "checkout.session.completed": {
              const session = event.data.object as Stripe.Checkout.Session;
              const userId = session.metadata?.user_id;
              const lockedPriceCents = Number(session.metadata?.locked_price_cents ?? 0) || null;
              const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
              const subscriptionId =
                typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

              if (userId) {
                await supabaseAdmin
                  .from("profiles")
                  .update({
                    subscription_status: "active",
                    subscription_started_at: new Date().toISOString(),
                    stripe_customer_id: customerId ?? null,
                    stripe_subscription_id: subscriptionId ?? null,
                    subscription_price_cents: lockedPriceCents,
                  })
                  .eq("id", userId);
              }
              break;
            }
            case "customer.subscription.updated":
            case "customer.subscription.deleted": {
              const sub = event.data.object as Stripe.Subscription;
              const userId = (sub.metadata?.user_id as string | undefined) ?? null;
              const status =
                event.type === "customer.subscription.deleted"
                  ? "cancelled"
                  : sub.status === "active" || sub.status === "trialing"
                    ? "active"
                    : sub.status;

              const query = supabaseAdmin.from("profiles").update({ subscription_status: status });
              if (userId) {
                await query.eq("id", userId);
              } else {
                await query.eq("stripe_subscription_id", sub.id);
              }
              break;
            }
            default:
              break;
          }
        } catch (err) {
          console.error("Webhook handler error", err);
          return new Response("Handler error", { status: 500 });
        }

        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});