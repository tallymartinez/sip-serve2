import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { GlassWater, Sparkles, QrCode, ShieldCheck, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/membership")({ component: Index });

interface TierInfo {
  total_members: number;
  next_signup_number: number;
  price_cents: number;
  spots_left_in_tier: number | null;
}

function Index() {
  const [tier, setTier] = useState<TierInfo | null>(null);

  useEffect(() => {
    supabase.rpc("current_tier_info").then(({ data }) => {
      if (Array.isArray(data) && data.length) setTier(data[0] as TierInfo);
    });
  }, []);

  const currentTierIndex = tier
    ? tier.next_signup_number <= 100
      ? 0
      : tier.next_signup_number <= 200
        ? 1
        : 2
    : 0;

  const tiers = [
    { name: "Founders", price: 80, range: "Members 1–100", note: "Founding rate" },
    { name: "Early", price: 90, range: "Members 101–200", note: "Early rate" },
    { name: "Standard", price: 100, range: "Members 201+", note: "Current rate" },
  ];

  return (
    <main>
      <section className="bg-hero relative overflow-hidden">
        <div className="container mx-auto px-4 py-24 md:py-32 text-center max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary-glow" /> Members only
          </div>
          <h1 className="mt-6 font-display text-5xl md:text-7xl leading-[1.05]">
            Two crafted cocktails. <span className="text-gradient">Every night.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            One subscription. Walk in, scan, sip. Your seat at the bar is always reserved.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link to="/signup"><Button size="lg" className="bg-gradient-primary shadow-glow">Become a member</Button></Link>
            <Link to="/login"><Button size="lg" variant="outline">Member sign in</Button></Link>
          </div>
          {tier && (
            <p className="mt-6 text-sm text-muted-foreground">
              Join now at{" "}
              <span className="text-primary-glow font-semibold">
                ${(tier.price_cents / 100).toFixed(0)}/mo
              </span>
              {tier.spots_left_in_tier !== null && tier.spots_left_in_tier > 0 && (
                <> · only {tier.spots_left_in_tier} spot{tier.spots_left_in_tier === 1 ? "" : "s"} left at this price</>
              )}
            </p>
          )}
        </div>
      </section>

      <section className="container mx-auto px-4 py-20 grid gap-6 md:grid-cols-3">
        {[
          { icon: GlassWater, title: "Two drinks daily", body: "Up to two signature cocktails per day, on the house. Excludes Luxury Classics and top-shelf spirits." },
          { icon: QrCode, title: "Scan & sip", body: "Your unique member QR is your key. Staff scans, drinks are redeemed instantly." },
          { icon: ShieldCheck, title: "Lock-in for 90 days", body: "Stay with us at least 90 days. After that, cancel any time from your dashboard." },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-xl border border-border/60 bg-card p-6 shadow-card">
            <Icon className="h-6 w-6 text-primary-glow" />
            <h3 className="mt-4 font-display text-xl">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </section>

      <section className="container mx-auto px-4 pb-24">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Membership pricing</p>
          <h2 className="mt-3 font-display text-4xl md:text-5xl">The earlier you join, the less you pay — forever.</h2>
          <p className="mt-3 text-muted-foreground">
            Your price locks in the day you sign up. It never goes up, even when the next tier opens.
          </p>
        </div>

        <div className="mt-12 max-w-md mx-auto">
          {(() => {
            const t = tiers[currentTierIndex];
            return (
              <div className="rounded-2xl border border-primary/60 bg-velvet p-8 shadow-velvet relative text-center">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-primary px-3 py-1 text-xs uppercase tracking-widest text-primary-foreground shadow-glow">
                  Available now
                </div>
                <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{t.name} tier</p>
                <div className="mt-3 flex items-baseline justify-center gap-1">
                  <span className="font-display text-6xl text-gradient">${t.price}</span>
                  <span className="text-muted-foreground">/ mo</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{t.range}</p>
                <p className="text-xs text-primary-glow mt-1">{t.note}</p>

                <ul className="mt-6 space-y-2 text-sm text-left max-w-xs mx-auto">
                  {["Two cocktails every night", "Excludes Luxury Classics & top-shelf spirits", "Personal QR member card", "Cancel anytime after 90 days"].map((b) => (
                    <li key={b} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-primary-glow shrink-0" />
                      <span className="text-muted-foreground">{b}</span>
                    </li>
                  ))}
                </ul>

                <Link to="/signup" className="mt-6 block">
                  <Button className="w-full bg-gradient-primary shadow-glow">Claim ${t.price}/mo</Button>
                </Link>
              </div>
            );
          })()}
        </div>
      </section>
    </main>
  );
}
