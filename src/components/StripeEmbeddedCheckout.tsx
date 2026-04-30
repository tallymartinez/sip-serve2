import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { createMembershipCheckout } from "@/server/payments.functions";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  returnUrl: string;
}

export function StripeMembershipCheckout({ returnUrl }: Props) {
  const fetchClientSecret = async (): Promise<string> => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Not signed in");
    const secret = await createMembershipCheckout({
      data: { accessToken: token, returnUrl, environment: getStripeEnvironment() },
    });
    if (!secret) throw new Error("Could not start checkout");
    return secret;
  };

  return (
    <div id="checkout">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}