import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { createCheckout, createPortalSession } from "@/server/stripe.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Mail, User as UserIcon, Wine, ExternalLink, Check, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session) return;
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: Dashboard,
});

interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  subscription_status: string;
  subscription_started_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  signup_number: number | null;
  subscription_price_cents: number | null;
}

interface TierInfo {
  total_members: number;
  next_signup_number: number;
  price_cents: number;
  spots_left_in_tier: number | null;
}

function Dashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [remaining, setRemaining] = useState<number>(2);
  const [qrUrl, setQrUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState<TierInfo | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  const redeemUrl = useMemo(
    () => (typeof window !== "undefined" && user ? `${window.location.origin}/redeem/${user.id}` : ""),
    [user],
  );

  useEffect(() => {
    if (!user) return;
    let mounted = true;

    async function load() {
      const [{ data: p }, { data: r }, { data: t }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle(),
        supabase.rpc("drinks_remaining_today", { _user_id: user!.id }),
        supabase.rpc("current_tier_info"),
      ]);
      if (!mounted) return;
      setProfile(p as Profile | null);
      setRemaining(typeof r === "number" ? r : 2);
      setTier(Array.isArray(t) && t.length ? (t[0] as TierInfo) : null);
      setLoading(false);
    }
    load();

    if (redeemUrl) {
      QRCode.toDataURL(redeemUrl, { width: 360, margin: 1, color: { dark: "#f5e6d6", light: "#1a0d0d" } })
        .then(setQrUrl).catch(() => {});
    }

    const ch = supabase
      .channel(`redemptions-${user.id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "redemptions", filter: `user_id=eq.${user.id}` },
        async () => {
          const { data: r } = await supabase.rpc("drinks_remaining_today", { _user_id: user.id });
          setRemaining(typeof r === "number" ? r : 0);
          toast.success("A drink was just redeemed on your card");
        })
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [user, redeemUrl]);

  async function manageSubscription() {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const res = await createPortalSession({
        headers: { authorization: `Bearer ${token}` },
      } as never);
      if (res?.url) window.location.href = res.url;
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Could not open billing portal");
    }
  }

  async function startCheckout() {
    setCheckoutBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const res = await createCheckout({
        headers: { authorization: `Bearer ${token}` },
      } as never);
      if (res?.url) window.location.href = res.url;
      else throw new Error("No checkout URL returned");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Could not start checkout");
    } finally {
      setCheckoutBusy(false);
    }
  }

  if (loading || !profile) {
    return <main className="container mx-auto px-4 py-16 text-muted-foreground">Loading your card…</main>;
  }

  const active = profile.subscription_status === "active";
  const startedAt = profile.subscription_started_at ? new Date(profile.subscription_started_at) : null;
  const daysActive = startedAt ? Math.floor((Date.now() - startedAt.getTime()) / 86400000) : 0;
  const canCancel = daysActive >= 90;
  const lockedPriceCents = profile.subscription_price_cents ?? tier?.price_cents ?? 8000;
  const priceDollars = (lockedPriceCents / 100).toFixed(0);

  if (!active) {
    const tierPrice = tier ? (tier.price_cents / 100).toFixed(0) : "80";
    const spotsLeft = tier?.spots_left_in_tier ?? null;
    const tierLabel =
      tier && tier.next_signup_number <= 100
        ? "Founders tier"
        : tier && tier.next_signup_number <= 200
          ? "Early tier"
          : "Standard tier";
    return (
      <main className="container mx-auto max-w-3xl px-4 py-10 md:py-16">
        <div className="rounded-2xl border border-border/60 bg-velvet p-8 md:p-12 shadow-velvet text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Velvet Club Membership</p>
          <h1 className="mt-3 font-display text-4xl md:text-5xl">Two cocktails a night. Every night.</h1>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
            Walk in, show your QR, drink. No tabs, no decisions, no surprises.
          </p>

          <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-xs uppercase tracking-widest text-primary-glow">
            <Sparkles className="h-3.5 w-3.5" /> {tierLabel}
            {spotsLeft !== null && spotsLeft > 0 && (
              <span className="text-muted-foreground normal-case tracking-normal">
                · only {spotsLeft} spot{spotsLeft === 1 ? "" : "s"} left at this price
              </span>
            )}
          </div>

          <div className="mt-6 flex items-baseline justify-center gap-2">
            <span className="font-display text-6xl text-gradient">${tierPrice}</span>
            <span className="text-muted-foreground">/ month</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Locked in for life. Future price changes won't affect you.
          </p>

          <ul className="mt-8 grid gap-3 text-left max-w-md mx-auto">
            {[
              "Two crafted cocktails every day",
              "Personal QR member card",
              "Skip the tab — just walk in",
              "Cancel anytime after 90 days",
              "Founders pricing locked forever",
            ].map((b) => (
              <li key={b} className="flex items-start gap-3 text-sm">
                <Check className="mt-0.5 h-4 w-4 text-primary-glow shrink-0" />
                <span>{b}</span>
              </li>
            ))}
          </ul>

          <Button
            onClick={startCheckout}
            disabled={checkoutBusy}
            size="lg"
            className="mt-8 bg-gradient-primary shadow-glow px-10"
          >
            {checkoutBusy ? "Opening checkout…" : `Become a member · $${tierPrice}/mo`}
          </Button>

          <p className="mt-4 text-xs text-muted-foreground">
            Tier pricing: 1–100: $80 · 101–200: $90 · 201+: $100 per month.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 py-10 md:py-16 max-w-5xl">
      <div className="grid gap-6 md:grid-cols-[1.1fr_1fr]">
        {/* Member card */}
        <div className="rounded-2xl border border-border/60 bg-velvet p-8 shadow-velvet">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Velvet Club</p>
              <h1 className="mt-2 font-display text-3xl">{profile.full_name || "Member"}</h1>
            </div>
            <Badge className={active ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}>
              {active ? "Active" : profile.subscription_status}
            </Badge>
          </div>

          <dl className="mt-6 space-y-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-4 w-4" /> <span>{profile.email}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <UserIcon className="h-4 w-4" /> <span className="font-mono text-xs">ID: {profile.id.slice(0, 8)}…</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarClock className="h-4 w-4" />
              <span>{startedAt ? `Member since ${startedAt.toLocaleDateString()}` : "No subscription yet"}</span>
            </div>
          </dl>

          <div className="mt-8 rounded-xl bg-background/50 border border-border/60 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Tonight's pour</p>
                <p className="mt-1 font-display text-2xl">
                  <span className="text-gradient">{remaining}</span> <span className="text-muted-foreground text-base">/ 2 drinks</span>
                </p>
              </div>
              <Wine className="h-10 w-10 text-primary-glow" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Resets at midnight, every night.</p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={manageSubscription} className="bg-gradient-primary shadow-glow">
              Manage subscription <ExternalLink className="ml-1 h-4 w-4" />
            </Button>
            <span className="self-center text-xs text-muted-foreground">
              ${priceDollars}/mo · locked
            </span>
            {!canCancel && active && (
              <p className="text-xs text-muted-foreground self-center">
                Cancellation unlocks {90 - daysActive} day{90 - daysActive === 1 ? "" : "s"} from today.
              </p>
            )}
          </div>
        </div>

        {/* QR code */}
        <div className="rounded-2xl border border-border/60 bg-card p-8 shadow-card flex flex-col items-center text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Show this at the bar</p>
          <div className="mt-4 rounded-xl bg-[oklch(0.14_0.015_20)] p-4 shadow-glow">
            {qrUrl ? <img src={qrUrl} alt="Member QR code" className="h-64 w-64 rounded-md" /> : <div className="h-64 w-64 animate-pulse rounded-md bg-muted" />}
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Unique to you. Don't share it.</p>
          <Link to="/redeem/$memberId" params={{ memberId: profile.id }} className="mt-2 text-xs text-primary-glow hover:underline">
            (test redemption page)
          </Link>
        </div>
      </div>
    </main>
  );
}
