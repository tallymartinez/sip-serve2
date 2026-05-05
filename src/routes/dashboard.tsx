import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { createBillingPortalSession } from "@/payments.functions";
import { StripeMembershipCheckout } from "@/components/StripeEmbeddedCheckout";
import { DEMO_COMPANY, DEMO_TIER, isDemoMode } from "@/lib/demo";
import { buildFallbackDrinkCards, type Company, drinkImages, headerImages, mapDrinkCards, pickImage, statusBadge, type DisplayDrinkCard, type DrinkCardRow } from "@/lib/drinkCards";
import { getStripeEnvironment } from "@/lib/stripe";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CalendarClock, Check, ExternalLink, GlassWater, Mail, Sparkles, User as UserIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    if (isDemoMode) return;
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session) return;
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: DashboardRoute,
});

export interface Profile {
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

interface SubscriptionSummary {
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
}

export async function loadRemainingForCompany(userId: string, companyId: string) {
  const scoped = await supabase.rpc("drinks_remaining_today", { _user_id: userId, _company_id: companyId });
  if (!scoped.error && typeof scoped.data === "number") return scoped.data;

  const legacy = await supabase.rpc("drinks_remaining_today", { _user_id: userId });
  return typeof legacy.data === "number" ? legacy.data : 0;
}

function DashboardRoute() {
  return isDemoMode ? <DemoDashboard /> : <Dashboard />;
}

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [drinkCards, setDrinkCards] = useState<DisplayDrinkCard[]>([]);
  const [remainingByCompany, setRemainingByCompany] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState<TierInfo | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);

  useEffect(() => {
    if (!user) return;
    let mounted = true;

    async function load() {
      const [{ data: p }, { data: t }, { data: companyRows }, { data: cardRows }, { data: subscriptionRow }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.rpc("current_tier_info"),
        supabase.from("companies").select("*").eq("active", true).order("name"),
        supabase.from("drink_cards").select("*").neq("status", "inactive").order("category").order("sort_order").order("name"),
        supabase
          .from("subscriptions")
          .select("status,current_period_end,cancel_at_period_end")
          .eq("user_id", user.id)
          .eq("environment", getStripeEnvironment())
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (!mounted) return;

      const companyList = (companyRows ?? []) as Company[];
      const mappedCards = mapDrinkCards(companyList, (cardRows ?? []) as DrinkCardRow[]);
      const remainingPairs = await Promise.all(
        companyList.map(async (company) => [company.id, await loadRemainingForCompany(user.id, company.id)] as const),
      );

      if (!mounted) return;

      setProfile(p as Profile | null);
      setTier(Array.isArray(t) && t.length ? (t[0] as TierInfo) : null);
      setSubscription((subscriptionRow as SubscriptionSummary | null) ?? null);
      setCompanies(companyList);
      setDrinkCards(mappedCards);
      setRemainingByCompany(Object.fromEntries(remainingPairs));
      setLoading(false);
    }

    load();

    return () => {
      mounted = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user || companies.length === 0) return;

    const ch = supabase
      .channel(`redemptions-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "redemptions", filter: `user_id=eq.${user.id}` },
        async () => {
          const pairs = await Promise.all(
            companies.map(async (company) => [company.id, await loadRemainingForCompany(user.id, company.id)] as const),
          );
          setRemainingByCompany(Object.fromEntries(pairs));
          toast.success("A drink was just redeemed on your card");
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [companies, user]);

  async function manageSubscription() {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const url = await createBillingPortalSession({
        data: {
          accessToken: token,
          returnUrl: `${window.location.origin}/dashboard`,
          environment: getStripeEnvironment(),
        },
      });
      if (url) {
        const w = window.open(url, "_blank", "noopener,noreferrer");
        if (!w) window.top!.location.href = url;
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Could not open billing portal");
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
  const renewalEndsAt = subscription?.current_period_end ? new Date(subscription.current_period_end) : null;
  const renewalEndsInDays = renewalEndsAt ? Math.max(0, Math.ceil((renewalEndsAt.getTime() - Date.now()) / 86400000)) : null;

  if (!active) {
    const tierPrice = tier ? (tier.price_cents / 100).toFixed(0) : "80";
    const spotsLeft = tier?.spots_left_in_tier ?? null;
    const tierLabel =
      tier && tier.next_signup_number <= 100
        ? "Founders tier"
        : tier && tier.next_signup_number <= 200
          ? "Early tier"
          : "Standard tier";

    if (showCheckout) {
      return (
        <main className="container mx-auto max-w-3xl px-4 py-10 md:py-16">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="font-display text-2xl">Complete your membership</h1>
            <Button variant="ghost" onClick={() => setShowCheckout(false)}>
              Cancel
            </Button>
          </div>
          <div className="rounded-2xl border border-border/60 bg-velvet p-4 md:p-6 shadow-velvet">
            <StripeMembershipCheckout returnUrl={`${window.location.origin}/dashboard?checkout=success`} />
          </div>
        </main>
      );
    }

    return (
      <main className="container mx-auto max-w-3xl px-4 py-10 md:py-16">
        <div className="rounded-2xl border border-border/60 bg-velvet p-8 text-center shadow-velvet md:p-12">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">O.V. Cocktail Club Membership</p>
          <h1 className="mt-3 font-display text-4xl md:text-5xl">Two cocktails a night. Every night.</h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">Walk in, choose your pour, and show your member QR when you’re ready.</p>

          <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-xs uppercase tracking-widest text-primary-glow">
            <Sparkles className="h-3.5 w-3.5" /> {tierLabel}
            {spotsLeft !== null && spotsLeft > 0 && (
              <span className="normal-case tracking-normal text-muted-foreground">
                · only {spotsLeft} spot{spotsLeft === 1 ? "" : "s"} left at this price
              </span>
            )}
          </div>

          <div className="mt-6 flex items-baseline justify-center gap-2">
            <span className="font-display text-6xl text-gradient">${tierPrice}</span>
            <span className="text-muted-foreground">/ month</span>
          </div>

          <ul className="mx-auto mt-8 grid max-w-md gap-3 text-left">
            {[
              "Two crafted cocktails every day",
              "Choose a drink card, then show your QR",
              "Cancel anytime after 90 days",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-glow" />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <Button onClick={() => setShowCheckout(true)} size="lg" className="mt-8 bg-gradient-primary px-10 shadow-glow">
            Become a member · ${tierPrice}/mo
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto max-w-6xl px-4 py-10 md:py-16">
      <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Member dashboard</p>
            <h1 className="mt-2 font-display text-3xl">{profile.full_name || "Member"}</h1>
            <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2"><Mail className="h-4 w-4" />{profile.email}</span>
              <span className="inline-flex items-center gap-2"><UserIcon className="h-4 w-4" />ID: {profile.id.slice(0, 8)}…</span>
              <span className="inline-flex items-center gap-2"><CalendarClock className="h-4 w-4" />{startedAt ? `Member since ${startedAt.toLocaleDateString()}` : "No subscription yet"}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-success text-success-foreground">Active</Badge>
            <span className="text-sm text-muted-foreground">${priceDollars}/mo · locked</span>
            <Button onClick={manageSubscription} className="bg-gradient-primary shadow-glow">
              Manage subscription <ExternalLink className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>

        {!canCancel && (
          <p className="mt-4 text-xs text-muted-foreground">
            Cancellation unlocks {90 - daysActive} day{90 - daysActive === 1 ? "" : "s"} from today.
          </p>
        )}

        {subscription?.cancel_at_period_end && renewalEndsAt && renewalEndsAt > new Date() && (
          <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <div>
                <p className="font-medium text-amber-100">Renewal is turned off</p>
                <p className="mt-1 text-amber-50/80">
                  Your membership stays active until {renewalEndsAt.toLocaleDateString()}
                  {renewalEndsInDays !== null ? ` (${renewalEndsInDays} day${renewalEndsInDays === 1 ? "" : "s"} remaining)` : ""}.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 space-y-10">
        {companies.map((company, companyIndex) => {
          const cards = drinkCards.filter((card) => card.company_id === company.id && card.status !== "inactive");
          const remaining = remainingByCompany[company.id] ?? company.daily_drink_limit ?? 2;
          const backgroundImage = pickImage(headerImages, companyIndex);

          return (
            <section key={company.id} className="space-y-4">
              <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-r from-[#5f141c] via-[#81222c] to-[#a43442] p-6 text-white shadow-velvet">
                {backgroundImage && (
                  <div className="absolute inset-0 opacity-20">
                    <img src={backgroundImage} alt="" className="h-full w-full object-cover" />
                  </div>
                )}
                <div className="relative flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-white/70">Company</p>
                    <h2 className="mt-2 font-display text-3xl md:text-4xl">{company.name}</h2>
                    <p className="mt-2 max-w-2xl text-sm text-white/80">
                      Choose a drink card below to open your QR code for this company’s venues.
                    </p>
                  </div>

                  <div className="min-w-[220px] rounded-2xl border border-white/15 bg-black/15 p-4 backdrop-blur">
                    <p className="text-xs uppercase tracking-[0.25em] text-white/65">Remaining today</p>
                    <div className="mt-2 flex items-center gap-3">
                      <GlassWater className="h-8 w-8 text-white" />
                      <p className="font-display text-3xl">
                        {remaining}
                        <span className="ml-2 text-lg text-white/70">/ {company.daily_drink_limit}</span>
                      </p>
                    </div>
                    <p className="mt-2 text-xs text-white/70">Shared across every venue in this company.</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {cards.map((card) => {
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() =>
                        navigate({
                          to: "/member-pass",
                          search: {
                            companyId: company.id,
                            companyName: company.name,
                            drinkId: card.id,
                            name: card.name,
                            description: card.description,
                            category: card.category,
                            price: card.price_label ?? "",
                            status: card.status,
                            image: card.imageUrl,
                          },
                        })
                      }
                      className="group relative min-h-[440px] overflow-hidden rounded-3xl border border-border/60 bg-card text-left shadow-card transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-velvet"
                    >
                      {card.imageUrl ? (
                        <img
                          src={card.imageUrl}
                          alt={card.name}
                          className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="absolute inset-0 bg-muted" />
                      )}
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,6,7,0.18),rgba(12,6,7,0.45)_38%,rgba(12,6,7,0.78)_68%,rgba(12,6,7,0.96)_100%)]" />

                      <div className="relative flex h-full min-h-[440px] flex-col justify-between p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex flex-wrap gap-2">
                            {statusBadge(card.status)}
                          </div>
                          <span className="rounded-full border border-white/20 bg-black/20 px-3 py-1 text-xs font-medium tracking-[0.2em] text-white/80 backdrop-blur">
                            Select drink
                          </span>
                        </div>

                        <div className="mt-auto space-y-4">
                          <div>
                            <p className="text-xs uppercase tracking-[0.25em] text-white/75">{card.category}</p>
                            <h3 className="mt-2 font-display text-3xl text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.45)]">{card.name}</h3>
                          </div>
                          <p className="max-w-[28ch] text-sm leading-6 text-white/85 drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)]">
                            {card.description || "Select this drink to generate your member QR."}
                          </p>
                          <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3">
                            <span className="text-sm text-white/80">
                              {card.price_label || (card.status === "included" ? "Included in membership" : "Visible on menu")}
                            </span>
                            <span className="text-sm font-medium text-primary-glow">Open QR</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}

                {cards.length === 0 && (
                  <div className="rounded-3xl border border-dashed border-border/60 bg-card p-6 text-sm text-muted-foreground">
                    No drink cards are set up for this company yet.
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}

function DemoDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const demoCards = useMemo(
    () =>
      buildFallbackDrinkCards(DEMO_COMPANY.id).slice(0, 8).map((card, index) => ({
        ...card,
        imageUrl: pickImage(drinkImages, index),
      })),
    [],
  );

  if (!user) {
    return <main className="container mx-auto px-4 py-16 text-muted-foreground">Sign in through demo mode to view the mock member card.</main>;
  }

  return (
    <main className="container mx-auto max-w-6xl px-4 py-10 md:py-16">
      <div className="mb-4 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
        Demo mode is active. Pick a drink card below to open the same QR flow without needing Supabase live.
      </div>

      <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Demo member dashboard</p>
            <h1 className="mt-2 font-display text-3xl">{user.user_metadata.full_name || "Demo Member"}</h1>
            <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2"><Mail className="h-4 w-4" />{user.email}</span>
              <span className="inline-flex items-center gap-2"><UserIcon className="h-4 w-4" />ID: {user.id.slice(0, 8)}…</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Badge className="bg-success text-success-foreground">Active</Badge>
            <span className="text-sm text-muted-foreground">${(DEMO_TIER.price_cents / 100).toFixed(0)}/mo · demo rate</span>
          </div>
        </div>
      </div>

      <section className="mt-8 space-y-4">
        <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-r from-[#5f141c] via-[#81222c] to-[#a43442] p-6 text-white shadow-velvet">
          {pickImage(headerImages, 0) && (
            <div className="absolute inset-0 opacity-20">
              <img src={pickImage(headerImages, 0)} alt="" className="h-full w-full object-cover" />
            </div>
          )}
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/70">Company</p>
              <h2 className="mt-2 font-display text-3xl md:text-4xl">{DEMO_COMPANY.name}</h2>
              <p className="mt-2 max-w-2xl text-sm text-white/80">Pick a drink card to generate the member QR for this demo company.</p>
            </div>
            <div className="min-w-[220px] rounded-2xl border border-white/15 bg-black/15 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.25em] text-white/65">Remaining today</p>
              <div className="mt-2 flex items-center gap-3">
                <GlassWater className="h-8 w-8 text-white" />
                <p className="font-display text-3xl">
                  2
                  <span className="ml-2 text-lg text-white/70">/ {DEMO_COMPANY.daily_drink_limit}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {demoCards.map((card) => {
            return (
              <button
                key={card.id}
                type="button"
                onClick={() =>
                  navigate({
                    to: "/member-pass",
                    search: {
                      companyId: DEMO_COMPANY.id,
                      companyName: DEMO_COMPANY.name,
                      drinkId: card.id,
                      name: card.name,
                      description: card.description,
                      category: card.category,
                      price: card.price_label ?? "",
                      status: card.status,
                      image: card.imageUrl,
                    },
                  })
                }
                className="group relative min-h-[440px] overflow-hidden rounded-3xl border border-border/60 bg-card text-left shadow-card transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-velvet"
              >
                {card.imageUrl ? (
                  <img
                    src={card.imageUrl}
                    alt={card.name}
                    className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="absolute inset-0 bg-muted" />
                )}
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,6,7,0.18),rgba(12,6,7,0.45)_38%,rgba(12,6,7,0.78)_68%,rgba(12,6,7,0.96)_100%)]" />

                <div className="relative flex h-full min-h-[440px] flex-col justify-between p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      {statusBadge(card.status)}
                    </div>
                    <span className="rounded-full border border-white/20 bg-black/20 px-3 py-1 text-xs font-medium tracking-[0.2em] text-white/80 backdrop-blur">
                      Select drink
                    </span>
                  </div>

                  <div className="mt-auto space-y-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.25em] text-white/75">{card.category}</p>
                      <h3 className="mt-2 font-display text-3xl text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.45)]">{card.name}</h3>
                    </div>
                    <p className="max-w-[28ch] text-sm leading-6 text-white/85 drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)]">
                      {card.description}
                    </p>
                    <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3">
                      <span className="text-sm text-white/80">{card.price_label || "Included in membership"}</span>
                      <span className="text-sm font-medium text-primary-glow">Open QR</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
