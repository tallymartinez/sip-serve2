import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { GlassWater, Sparkles, Star, ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { defaultHomeContent, mergeHomeContent, type HomeContent, type CocktailSection } from "@/lib/homeContent";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "O.V. Cocktail Club — Crafted cocktails, every day" },
      { name: "description", content: "Member home for the O.V. Cocktail Club." },
      { property: "og:title", content: "O.V. Cocktail Club" },
      { property: "og:description", content: "Members-only cocktail club." },
    ],
  }),
  component: Home,
});

function Section({ section }: { section: CocktailSection }) {
  return (
    <div>
      <h3 className="font-display text-2xl md:text-3xl text-primary-glow uppercase tracking-wider text-center">{section.heading}</h3>
      {section.subtitle && (
        <p className="mt-2 text-center text-xs uppercase tracking-[0.2em] text-muted-foreground">{section.subtitle}</p>
      )}
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        {section.items.map((c) => (
          <div key={c.name} className="rounded-xl border border-border/60 bg-card/80 p-5 shadow-card">
            <div className="flex items-baseline justify-between gap-3">
              <h4 className="font-display text-xl">{c.name}</h4>
              {c.price && <span className="text-sm text-primary-glow font-medium shrink-0">${c.price}</span>}
            </div>
            {c.notes && <p className="mt-2 text-sm text-muted-foreground">{c.notes}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [content, setContent] = useState<HomeContent>(defaultHomeContent);
  const [cocktailsOpen, setCocktailsOpen] = useState(false);
  const [supperOpen, setSupperOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.navigate({ to: "/membership" });
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    (supabase.from("home_content" as never).select("data").eq("id" as never, "default" as never).maybeSingle() as unknown as Promise<{ data: { data: Partial<HomeContent> } | null }>)
      .then(({ data }) => {
        if (data?.data) setContent(mergeHomeContent(data.data));
      });
  }, [user]);

  if (loading || !user) {
    return (
      <main className="container mx-auto px-4 py-24 text-center text-muted-foreground">
        Loading…
      </main>
    );
  }

  return (
    <main>
      {/* Hero */}
      <section className="bg-hero relative overflow-hidden">
        {content.heroImageUrl && (
          <div className="absolute inset-0">
            <img src={content.heroImageUrl} alt="" className="w-full h-full object-cover opacity-30" />
            <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/60 to-background" />
          </div>
        )}
        <div className="container relative mx-auto px-4 py-24 md:py-32 text-center max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            <GlassWater className="h-3.5 w-3.5 text-primary-glow" /> O.V. Cocktail Club
          </div>
          <h1 className="mt-6 font-display text-5xl md:text-7xl leading-[1.05]">
            Where every pour <span className="text-gradient">tells a story.</span>
          </h1>
          <div className="mt-8 text-left text-base md:text-lg text-muted-foreground space-y-4">
            <p className="font-display text-2xl md:text-3xl text-foreground text-center">{content.welcomeHeading}</p>
            {content.welcomeParagraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            {content.welcomeSignoff && (
              <p className="italic whitespace-pre-line">{content.welcomeSignoff}</p>
            )}
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link to="/dashboard"><Button size="lg" className="bg-gradient-primary shadow-glow">My member card</Button></Link>
          </div>
        </div>
      </section>

      {/* Gallery */}
      {content.galleryImages && content.galleryImages.length > 0 && (
        <section className="container mx-auto px-4 py-16">
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {content.galleryImages.filter(Boolean).map((src, i) => (
              <div key={i} className="aspect-[4/3] overflow-hidden rounded-xl border border-border/60 shadow-card">
                <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Cocktail menu */}
      <section className="bg-velvet/30 border-y border-border/40">
        <div className="container mx-auto px-4 py-20">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground inline-flex items-center gap-2"><Star className="h-3.5 w-3.5 text-primary-glow" /> The list</p>
            <h2 className="mt-3 font-display text-4xl md:text-5xl">Cocktails</h2>
            <p className="mt-3 text-muted-foreground">{content.cocktailsIntro}</p>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" onClick={() => setCocktailsOpen((o) => !o)} className="bg-gradient-primary shadow-glow" aria-expanded={cocktailsOpen}>
              Mercato Cocktails
              <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${cocktailsOpen ? "rotate-180" : ""}`} />
            </Button>
            <Button size="lg" onClick={() => setSupperOpen((o) => !o)} variant="outline" aria-expanded={supperOpen}>
              Supper Club Cocktails
              <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${supperOpen ? "rotate-180" : ""}`} />
            </Button>
          </div>
          {cocktailsOpen && (
            <div className="mt-14 space-y-14 max-w-5xl mx-auto">
              {content.cocktailSections.map((s) => <Section key={s.heading} section={s} />)}
            </div>
          )}
          {supperOpen && (
            <div className="mt-14 space-y-14 max-w-5xl mx-auto">
              {content.supperClubSections.map((s) => <Section key={s.heading} section={s} />)}
            </div>
          )}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="container mx-auto px-4 py-24 text-center max-w-2xl">
        {content.closingImageUrl && (
          <div className="mb-8 overflow-hidden rounded-2xl border border-border/60 shadow-velvet">
            <img src={content.closingImageUrl} alt="" className="w-full h-64 md:h-80 object-cover" loading="lazy" />
          </div>
        )}
        <Sparkles className="mx-auto h-6 w-6 text-primary-glow" />
        <h2 className="mt-4 font-display text-4xl md:text-5xl">{content.closingHeading}</h2>
        <p className="mt-3 text-muted-foreground">{content.closingBody}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/dashboard"><Button size="lg" className="bg-gradient-primary shadow-glow">Open my card</Button></Link>
        </div>
      </section>
    </main>
  );
}
