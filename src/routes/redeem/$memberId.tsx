import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Wine, CheckCircle2, Lock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/redeem/$memberId")({
  component: Redeem,
});

interface MemberInfo {
  id: string;
  full_name: string;
  email: string;
  subscription_status: string;
  remaining: number;
}
interface VenuePublic {
  venue_pin: string;
  daily_drink_limit: number;
  venue_name: string;
  redemptions_paused: boolean;
  paused_message: string | null;
}

function Redeem() {
  const { memberId } = Route.useParams();
  const [info, setInfo] = useState<MemberInfo | null>(null);
  const [accessCode, setAccessCode] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [empCode, setEmpCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [venue, setVenue] = useState<VenuePublic | null>(null);

  useEffect(() => {
    supabase.from("venue_settings").select("venue_pin,daily_drink_limit,venue_name,redemptions_paused,paused_message").eq("id", true).maybeSingle()
      .then(({ data }) => { if (data) setVenue(data as VenuePublic); });
  }, []);

  async function load() {
    setErr(null);
    const { data: profile, error } = await supabase
      .from("profiles").select("id, full_name, email, subscription_status").eq("id", memberId).maybeSingle();
    if (error || !profile) { setErr("Member not found"); return; }
    const { data: r } = await supabase.rpc("drinks_remaining_today", { _user_id: memberId });
    setInfo({ ...(profile as Omit<MemberInfo, "remaining">), remaining: typeof r === "number" ? r : 0 });
  }

  useEffect(() => { if (unlocked) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [unlocked, memberId]);

  async function tryUnlock(e: React.FormEvent) {
    e.preventDefault();
    const code = accessCode.trim();
    if (venue && code === venue.venue_pin) {
      setUnlocked(true);
      return;
    }
    // Check admin personal override code (logs the use)
    const { data: adminId } = await supabase.rpc("verify_admin_code", { _code: code, _member_id: memberId });
    if (adminId) {
      setUnlocked(true);
      toast.success("Override code accepted");
      return;
    }
    toast.error("Incorrect access code");
  }

  async function redeem(qty: 1 | 2) {
    if (!info) return;
    if (venue?.redemptions_paused) return toast.error(venue.paused_message || "Redemptions are paused");
    if (info.subscription_status !== "active") return toast.error("Subscription is not active");
    if (info.remaining < qty) return toast.error(`Only ${info.remaining} drink(s) left today`);
    if (!empCode.trim()) return toast.error("Enter your server ID");

    setBusy(true);
    // Look up server (employee) by their unique code
    const { data: emp, error: empErr } = await supabase
      .from("employees").select("id, active, full_name").eq("employee_code", empCode.trim()).maybeSingle();
    if (empErr || !emp || !emp.active) {
      setBusy(false);
      return toast.error("Invalid or inactive server ID");
    }

    const { error: insErr } = await supabase
      .from("redemptions").insert({ user_id: memberId, employee_id: emp.id, drinks_redeemed: qty });
    setBusy(false);
    if (insErr) return toast.error(insErr.message);
    toast.success(`Redeemed ${qty} drink${qty > 1 ? "s" : ""} · ${emp.full_name}`);
    setEmpCode("");
    load();
  }

  if (!unlocked) {
    return (
      <main className="container mx-auto max-w-sm px-4 py-16">
        <form onSubmit={tryUnlock} className="rounded-2xl border border-border/60 bg-velvet p-8 shadow-velvet text-center">
          <Lock className="mx-auto h-8 w-8 text-primary-glow" />
          <h1 className="mt-4 font-display text-2xl">Staff access</h1>
          <p className="mt-1 text-sm text-muted-foreground">Enter the 4-digit code to redeem.</p>
          <div className="mt-6 text-left">
            <Label htmlFor="access">Access code</Label>
            <Input
              id="access"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value.replace(/\D/g, ""))}
              placeholder="••••"
              autoFocus
              autoComplete="off"
              className="text-center tracking-[0.5em] text-2xl font-display"
            />
          </div>
          <Button type="submit" className="mt-6 w-full bg-gradient-primary shadow-glow">
            Unlock
          </Button>
        </form>
      </main>
    );
  }

  return (
    <main className="container mx-auto max-w-md px-4 py-10">
      <h1 className="font-display text-3xl">Redeem drinks</h1>
      <p className="text-sm text-muted-foreground">Confirm the member and tap redeem.</p>

      {err && <div className="mt-6 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">{err}</div>}

      {info && (
        <div className="mt-6 rounded-2xl border border-border/60 bg-velvet p-6 shadow-velvet">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Member</p>
              <h2 className="mt-1 font-display text-2xl">{info.full_name || "—"}</h2>
              <p className="text-sm text-muted-foreground">{info.email}</p>
            </div>
            <Badge className={info.subscription_status === "active" ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}>
              {info.subscription_status}
            </Badge>
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-lg bg-background/50 border border-border/60 p-4">
            <Wine className="h-6 w-6 text-primary-glow" />
            <div>
              <p className="font-display text-xl"><span className="text-gradient">{info.remaining}</span> <span className="text-muted-foreground text-sm">/ {venue?.daily_drink_limit ?? 2} left today</span></p>
            </div>
          </div>

          {venue?.redemptions_paused && (
            <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {venue.paused_message || "Redemptions are temporarily paused."}
            </div>
          )}

          <div className="mt-6">
            <Label htmlFor="empcode">Your server ID</Label>
            <Input
              id="empcode"
              value={empCode}
              onChange={(e) => setEmpCode(e.target.value)}
              placeholder="e.g. EMP-1234"
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-muted-foreground">Required for every redemption — tracks who poured the drink.</p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button onClick={() => redeem(1)} disabled={busy || info.remaining < 1} className="bg-gradient-primary shadow-glow h-14 text-base">
              <CheckCircle2 className="mr-2 h-5 w-5" /> Redeem 1
            </Button>
            <Button onClick={() => redeem(2)} disabled={busy || info.remaining < 2} variant="secondary" className="h-14 text-base">
              <CheckCircle2 className="mr-2 h-5 w-5" /> Redeem 2
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
