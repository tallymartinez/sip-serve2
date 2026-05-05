import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { ArrowLeft, Building2, QrCode } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { isDemoMode } from "@/lib/demo";
import { statusBadge } from "@/lib/drinkCards";
import { supabase } from "@/integrations/supabase/client";

type SearchState = {
  companyId: string;
  companyName: string;
  drinkId: string;
  name: string;
  description: string;
  category: string;
  price: string;
  status: "included" | "not_included" | "inactive";
  image: string;
};

export const Route = createFileRoute("/member-pass")({
  validateSearch: (search): SearchState => ({
    companyId: typeof search.companyId === "string" ? search.companyId : "",
    companyName: typeof search.companyName === "string" ? search.companyName : "",
    drinkId: typeof search.drinkId === "string" ? search.drinkId : "",
    name: typeof search.name === "string" ? search.name : "",
    description: typeof search.description === "string" ? search.description : "",
    category: typeof search.category === "string" ? search.category : "",
    price: typeof search.price === "string" ? search.price : "",
    status:
      search.status === "included" || search.status === "not_included" || search.status === "inactive"
        ? search.status
        : "included",
    image: typeof search.image === "string" ? search.image : "",
  }),
  beforeLoad: async () => {
    if (isDemoMode) return;
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session) return;
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: MemberPassPage,
});

function MemberPassPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const search = Route.useSearch();
  const [qrUrl, setQrUrl] = useState("");

  const redeemUrl = useMemo(() => {
    if (typeof window === "undefined" || !user || !search.companyId || !search.name) return "";
    const url = new URL(`${window.location.origin}/redeem/${user.id}`);
    url.searchParams.set("drink", search.name);
    url.searchParams.set("company", search.companyId);
    return url.toString();
  }, [search.companyId, search.name, user]);

  useEffect(() => {
    if (!redeemUrl) {
      setQrUrl("");
      return;
    }

    QRCode.toDataURL(redeemUrl, {
      width: 420,
      margin: 1,
      color: { dark: "#f5e6d6", light: "#1a0d0d" },
    }).then(setQrUrl).catch(() => setQrUrl(""));
  }, [redeemUrl]);

  if (!search.companyId || !search.name) {
    return (
      <main className="container mx-auto flex min-h-[70vh] max-w-3xl items-center justify-center px-4 py-16">
        <div className="rounded-3xl border border-border/60 bg-card p-8 text-center shadow-card">
          <p className="text-sm text-muted-foreground">No drink is selected yet.</p>
          <Button className="mt-4" onClick={() => navigate({ to: "/dashboard" })}>
            Back to dashboard
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(151,32,46,0.2),_rgba(10,6,8,1)_58%)]">
      <section className="relative min-h-screen overflow-hidden">
        {search.image && (
          <div className="absolute inset-0">
            <img src={search.image} alt={search.name} className="h-full w-full object-cover" />
          </div>
        )}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,6,8,0.18),rgba(10,6,8,0.42)_28%,rgba(10,6,8,0.76)_60%,rgba(10,6,8,0.96)_100%)]" />

        <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 md:px-6 md:py-8">
          <div className="flex items-center justify-between gap-4">
            <Button
              variant="outline"
              className="border-white/20 bg-black/20 text-white backdrop-blur hover:bg-black/30 hover:text-white"
              onClick={() => navigate({ to: "/dashboard" })}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to dashboard
            </Button>

            <Badge variant="outline" className="border-white/20 bg-black/20 text-white backdrop-blur">
              <QrCode className="mr-2 h-3.5 w-3.5" />
              Member QR pass
            </Badge>
          </div>

          <div className="mt-auto grid gap-6 pb-4 pt-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-white/20 bg-black/20 text-white backdrop-blur">
                  <Building2 className="mr-2 h-3.5 w-3.5" />
                  {search.companyName || "Company"}
                </Badge>
                {statusBadge(search.status)}
              </div>

              <p className="mt-6 text-xs uppercase tracking-[0.3em] text-white/70">{search.category || "Drink Card"}</p>
              <h1 className="mt-3 font-display text-5xl text-white drop-shadow-[0_12px_36px_rgba(0,0,0,0.55)] md:text-7xl">
                {search.name}
              </h1>
              {search.description && (
                <p className="mt-5 max-w-xl text-base leading-7 text-white/82 drop-shadow-[0_6px_20px_rgba(0,0,0,0.5)] md:text-lg">
                  {search.description}
                </p>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-white/80">
                {search.price && <span>{search.price}</span>}
                <span>{search.status === "included" ? "Included in membership" : "Visible on menu"}</span>
              </div>

              {search.status === "not_included" && (
                <p className="mt-4 max-w-xl text-sm text-white/75">
                  This drink is shown on the menu but is not included in the subscription redemption count.
                </p>
              )}
            </div>

            <div className="rounded-[2rem] border border-white/12 bg-[rgba(14,9,10,0.72)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-md md:p-6">
              <p className="text-center text-xs uppercase tracking-[0.25em] text-white/60">Show this to your server</p>
              <div className="mt-4 rounded-[1.5rem] bg-[oklch(0.14_0.015_20)] p-4 shadow-glow">
                {qrUrl ? (
                  <img src={qrUrl} alt={`${search.name} QR code`} className="mx-auto aspect-square w-full max-w-[380px] rounded-2xl" />
                ) : (
                  <div className="mx-auto aspect-square w-full max-w-[380px] animate-pulse rounded-2xl bg-muted" />
                )}
              </div>
              <p className="mt-4 text-center text-sm text-white/72">
                This QR is generated for your member card and the selected drink.
              </p>
              <a href={redeemUrl} className="mt-4 block text-center text-xs text-primary-glow hover:underline">
                Open redemption page
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
