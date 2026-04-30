import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Wine } from "lucide-react";

export const Route = createFileRoute("/staff")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: Staff,
});

function Staff() {
  const { isEmployee } = useAuth();
  const [today, setToday] = useState<{ count: number; drinks: number }>({ count: 0, drinks: 0 });

  useEffect(() => {
    if (!isEmployee) return;
    supabase.from("redemptions").select("drinks_redeemed").eq("redeemed_date", new Date().toISOString().slice(0, 10))
      .then(({ data }) => {
        const drinks = (data ?? []).reduce((s, r) => s + (r.drinks_redeemed ?? 0), 0);
        setToday({ count: data?.length ?? 0, drinks });
      });
  }, [isEmployee]);

  if (!isEmployee) return <main className="container mx-auto px-4 py-16">Staff only.</main>;

  return (
    <main className="container mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl">Staff terminal</h1>
      <p className="mt-1 text-sm text-muted-foreground">Scan a member QR to start a redemption.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-card p-6">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Redemptions today</p>
          <p className="mt-2 font-display text-3xl">{today.count}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-6">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Drinks served today</p>
          <p className="mt-2 font-display text-3xl text-gradient flex items-center gap-2"><Wine className="h-7 w-7 text-primary-glow" />{today.drinks}</p>
        </div>
      </div>
      <p className="mt-8 rounded-lg border border-dashed border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
        Use the camera app on your phone to scan a member QR code. It opens this site at <code>/redeem/&lt;member-id&gt;</code>.
      </p>
    </main>
  );
}
