import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { GlassWater, Sparkles, Flame, Star } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "O.V. Cocktail Club — Crafted cocktails, every night" },
      { name: "description", content: "Discover signature cocktails, member promotions, and the O.V. Cocktail Club experience." },
      { property: "og:title", content: "O.V. Cocktail Club" },
      { property: "og:description", content: "Crafted cocktails, members-only promotions, every night." },
    ],
  }),
  component: Home,
});

const promotions = [
  { title: "Two-for-Tuesday", body: "Members bring a friend on Tuesdays — second cocktail on the house.", tag: "Weekly" },
  { title: "Barrel-Aged Friday", body: "First pour of the new barrel-aged Old Fashioned drops every Friday at 7pm.", tag: "Limited" },
  { title: "Founders' Hour", body: "Founding members get a complimentary tasting flight on the first Sunday of each month.", tag: "Founders" },
];

const cocktails = [
  { name: "Velvet Negroni", notes: "Campari, sweet vermouth, barrel-rested gin. Bittersweet, silky, unforgettable.", accent: "Bitter · Stirred" },
  { name: "Smoke & Stone", notes: "Mezcal, charred pineapple, lime, a whisper of habanero. Smoldering and bright.", accent: "Smoky · Shaken" },
  { name: "Midnight Garden", notes: "Gin, elderflower, cucumber, basil oil. Crisp, herbal, garden-fresh.", accent: "Herbal · Crisp" },
  { name: "Old Vines Old Fashioned", notes: "Single-barrel bourbon, demerara, black walnut bitters, orange oil.", accent: "Spirit-forward" },
];

function Home() {
  return (
    <main>
      {/* Hero */}
      <section className="bg-hero relative overflow-hidden">
        <div className="container mx-auto px-4 py-24 md:py-32 text-center max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            <GlassWater className="h-3.5 w-3.5 text-primary-glow" /> O.V. Cocktail Club
          </div>
          <h1 className="mt-6 font-display text-5xl md:text-7xl leading-[1.05]">
            Where every pour <span className="text-gradient">tells a story.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            A members' cocktail club for those who take their nightcap seriously. Crafted recipes, rare spirits, and a seat at the bar that's always yours.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link to="/membership"><Button size="lg" className="bg-gradient-primary shadow-glow">Become a member</Button></Link>
            <Link to="/login"><Button size="lg" variant="outline">Member sign in</Button></Link>
          </div>
        </div>
      </section>

      {/* Promotions */}
      <section className="container mx-auto px-4 py-20">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground inline-flex items-center gap-2"><Flame className="h-3.5 w-3.5 text-primary-glow" /> What's pouring</p>
          <h2 className="mt-3 font-display text-4xl md:text-5xl">Member promotions</h2>
          <p className="mt-3 text-muted-foreground">Limited drops, weekly rituals, and quiet little perks reserved for the Club.</p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {promotions.map((p) => (
            <div key={p.title} className="rounded-xl border border-border/60 bg-card p-6 shadow-card">
              <span className="inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] uppercase tracking-widest text-primary-glow">{p.tag}</span>
              <h3 className="mt-3 font-display text-2xl">{p.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Cocktail menu */}
      <section className="bg-velvet/30 border-y border-border/40">
        <div className="container mx-auto px-4 py-20">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground inline-flex items-center gap-2"><Star className="h-3.5 w-3.5 text-primary-glow" /> The list</p>
            <h2 className="mt-3 font-display text-4xl md:text-5xl">Signature cocktails</h2>
            <p className="mt-3 text-muted-foreground">A rotating list of house originals, refined over countless late nights behind the bar.</p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {cocktails.map((c) => (
              <div key={c.name} className="rounded-xl border border-border/60 bg-card/80 p-6 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-2xl">{c.name}</h3>
                  <GlassWater className="h-6 w-6 text-primary-glow shrink-0" />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{c.notes}</p>
                <p className="mt-3 text-[11px] uppercase tracking-[0.25em] text-primary-glow">{c.accent}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="container mx-auto px-4 py-24 text-center max-w-2xl">
        <Sparkles className="mx-auto h-6 w-6 text-primary-glow" />
        <h2 className="mt-4 font-display text-4xl md:text-5xl">Pull up a stool.</h2>
        <p className="mt-3 text-muted-foreground">Two cocktails every night, on the house, for the price of a decent bottle of wine. Membership is intentionally small.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/membership"><Button size="lg" className="bg-gradient-primary shadow-glow">See membership</Button></Link>
        </div>
      </section>
    </main>
  );
}
