import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Mail, User as UserIcon, Wine, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
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
}

function Dashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [remaining, setRemaining] = useState<number>(2);
  const [qrUrl, setQrUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const redeemUrl = useMemo(
    () => (typeof window !== "undefined" && user ? `${window.location.origin}/redeem/${user.id}` : ""),
    [user],
  );

  useEffect(() => {
    if (!user) return;
    let mounted = true;

    async function load() {
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle(),
        supabase.rpc("drinks_remaining_today", { _user_id: user!.id }),
      ]);
      if (!mounted) return;
      setProfile(p as Profile | null);
      setRemaining(typeof r === "number" ? r : 2);
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
    toast.info("Stripe portal not configured yet — your admin will enable this soon.");
  }

  if (loading || !profile) {
    return <main className="container mx-auto px-4 py-16 text-muted-foreground">Loading your card…</main>;
  }

  const active = profile.subscription_status === "active";
  const startedAt = profile.subscription_started_at ? new Date(profile.subscription_started_at) : null;
  const daysActive = startedAt ? Math.floor((Date.now() - startedAt.getTime()) / 86400000) : 0;
  const canCancel = daysActive >= 90;

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
