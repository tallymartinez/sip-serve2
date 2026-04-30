import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Wine, Sparkles, QrCode, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({ component: Index });

function Index() {
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
        </div>
      </section>

      <section className="container mx-auto px-4 py-20 grid gap-6 md:grid-cols-3">
        {[
          { icon: Wine, title: "Two drinks daily", body: "Up to two signature cocktails per day, on the house, every day of your membership." },
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
    </main>
  );
}
