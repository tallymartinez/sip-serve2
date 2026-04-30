import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Wine, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/redeem/$memberId")({
  beforeLoad: async ({ params }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      throw redirect({ to: "/login", search: { redirect: `/redeem/${params.memberId}` } as never });
    }
  },
  component: Redeem,
});

interface MemberInfo {
  id: string;
  full_name: string;
  email: string;
  subscription_status: string;
  remaining: number;
}

function Redeem() {
  const { memberId } = Route.useParams();
  const { isEmployee, loading: authLoading } = useAuth();
  const [info, setInfo] = useState<MemberInfo | null>(null);
  const [empCode, setEmpCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    const { data: profile, error } = await supabase
      .from("profiles").select("id, full_name, email, subscription_status").eq("id", memberId).maybeSingle();
    if (error || !profile) { setErr("Member not found"); return; }
    const { data: r } = await supabase.rpc("drinks_remaining_today", { _user_id: memberId });
    setInfo({ ...(profile as Omit<MemberInfo, "remaining">), remaining: typeof r === "number" ? r : 0 });
  }

  useEffect(() => { if (isEmployee) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [isEmployee, memberId]);

  async function redeem(qty: 1 | 2) {
    if (!info) return;
    if (info.subscription_status !== "active") return toast.error("Subscription is not active");
    if (info.remaining < qty) return toast.error(`Only ${info.remaining} drink(s) left today`);
    if (!empCode.trim()) return toast.error("Enter your employee code");

    setBusy(true);
    // Look up employee by code
    const { data: emp, error: empErr } = await supabase
      .from("employees").select("id, active").eq("employee_code", empCode.trim()).maybeSingle();
    if (empErr || !emp || !emp.active) { setBusy(false); return toast.error("Invalid or inactive employee code"); }

    const { error: insErr } = await supabase
      .from("redemptions").insert({ user_id: memberId, employee_id: emp.id, drinks_redeemed: qty });
    setBusy(false);
    if (insErr) return toast.error(insErr.message);
    toast.success(`Redeemed ${qty} drink${qty > 1 ? "s" : ""}`);
    setEmpCode("");
    load();
  }

  if (authLoading) return <main className="container mx-auto px-4 py-16">Loading…</main>;
  if (!isEmployee) {
    return (
      <main className="container mx-auto max-w-md px-4 py-16 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
        <h1 className="mt-4 font-display text-2xl">Staff only</h1>
        <p className="mt-2 text-sm text-muted-foreground">This page is for venue staff. Contact your manager for access.</p>
      </main>
    );
  }

  return (
    <main className="container mx-auto max-w-md px-4 py-10">
      <h1 className="font-display text-3xl">Redeem drinks</h1>
      <p className="text-sm text-muted-foreground">Confirm the member, enter your code, redeem.</p>

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
              <p className="font-display text-xl"><span className="text-gradient">{info.remaining}</span> <span className="text-muted-foreground text-sm">/ 2 left today</span></p>
            </div>
          </div>

          <div className="mt-6">
            <Label htmlFor="empcode">Employee code</Label>
            <Input id="empcode" value={empCode} onChange={(e) => setEmpCode(e.target.value)} placeholder="e.g. EMP-1234" autoComplete="off" />
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
