import Stripe from 'stripe';

const getEnv = (key: string): string => {
  const value = process.env[key];
  if (!value || value.includes("_xxx")) {
    throw new Error(`${key} is not configured with a real Stripe value`);
  }
  return value;
};

export type StripeEnv = 'sandbox' | 'live';

function getStripeSecretKey(env: StripeEnv): string {
  return env === 'sandbox'
    ? getEnv('STRIPE_SANDBOX_API_KEY')
    : getEnv('STRIPE_LIVE_API_KEY');
}

export function createStripeClient(env: StripeEnv): Stripe {
  return new Stripe(getStripeSecretKey(env), {
    apiVersion: '2026-03-25.dahlia' as any,
  });
}

export async function verifyWebhook(
  req: Request,
  env: StripeEnv,
): Promise<{ type: string; data: { object: any } }> {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();
  const secret =
    env === 'sandbox'
      ? getEnv('PAYMENTS_SANDBOX_WEBHOOK_SECRET')
      : getEnv('PAYMENTS_LIVE_WEBHOOK_SECRET');

  if (!signature || !body) throw new Error('Missing signature or body');
  const stripe = createStripeClient(env);
  return stripe.webhooks.constructEventAsync(body, signature, secret) as Promise<{
    type: string;
    data: { object: any };
  }>;
}
