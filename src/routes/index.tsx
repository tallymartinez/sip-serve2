import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GlassWater, Sparkles, Star } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { defaultHomeContent, getStoredDemoHomeContent, mergeHomeContent, type HomeContent } from "@/lib/homeContent";
import { DEMO_COMPANIES, isDemoMode } from "@/lib/demo";
import { buildFallbackDrinkCards, mapDrinkCards, statusBadge, type Company, type DisplayDrinkCard, type DrinkCardRow } from "@/lib/drinkCards";

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

function getSelectedDrinkMap(content: HomeContent, companyIds: string[]) {
  const scoped = content.selectedDrinkCardIdsByCompany ?? {};
  const hasScopedSelection = Object.keys(scoped).length > 0;
  if (hasScopedSelection) return scoped;

  const legacyIds = content.selectedDrinkCardIds ?? [];
  if (legacyIds.length === 0 || companyIds.length === 0) return {};

  return { [companyIds[0]]: legacyIds };
}

function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [content, setContent] = useState<HomeContent>(defaultHomeContent);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [drinkCards, setDrinkCards] = useState<DisplayDrinkCard[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      router.navigate({ to: "/membership" });
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    if (isDemoMode) {
      const demoCompanies = DEMO_COMPANIES.map((company) => ({ ...company }) as Company);
      setCompanies(demoCompanies);
      setDrinkCards(demoCompanies.flatMap((company) => buildFallbackDrinkCards(company.id)));
      setContent(getStoredDemoHomeContent());
      return;
    }
    Promise.all([
      supabase.from("home_content" as never).select("data").eq("id" as never, "default" as never).maybeSingle() as unknown as Promise<{ data: { data: Partial<HomeContent> } | null }>,
      supabase.from("companies").select("*").eq("active", true).order("name"),
      supabase.from("drink_cards").select("*").neq("status", "inactive").order("category").order("sort_order").order("name"),
    ]).then(([homeResult, companyResult, drinkResult]) => {
      if (homeResult.data?.data) setContent(mergeHomeContent(homeResult.data.data));
      const nextCompanies = (companyResult.data ?? []) as Company[];
      setCompanies(nextCompanies);
      setDrinkCards(mapDrinkCards(nextCompanies, (drinkResult.data ?? []) as DrinkCardRow[]));
    });
  }, [user]);

  const featuredCompanies = useMemo(() => {
    const companyIds = companies.map((company) => company.id);
    const selectionMap = getSelectedDrinkMap(content, companyIds);
    const hasScopedSelections = Object.values(selectionMap).some((ids) => ids.length > 0);

    return companies
      .map((company) => {
        const allCards = drinkCards.filter((card) => card.company_id === company.id && card.status !== "inactive");
        const selectedIds = selectionMap[company.id] ?? [];
        const cards = hasScopedSelections
          ? allCards.filter((card) => selectedIds.includes(card.id))
          : allCards;

        return { company, cards };
      })
      .filter((section) => section.cards.length > 0);
  }, [companies, content, drinkCards]);

  useEffect(() => {
    if (featuredCompanies.length === 0) {
      setSelectedCompanyId("");
      return;
    }

    if (!featuredCompanies.some(({ company }) => company.id === selectedCompanyId)) {
      setSelectedCompanyId(featuredCompanies[0].company.id);
    }
  }, [featuredCompanies, selectedCompanyId]);

  const activeCompanySection = featuredCompanies.find(({ company }) => company.id === selectedCompanyId) ?? null;

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
      <section
        className="bg-hero relative overflow-hidden"
        style={content.heroDisplay?.height ? { minHeight: `${content.heroDisplay.height}px` } : undefined}
      >
        {content.heroImageUrl && (
          <div className="absolute inset-0">
            <img
              src={content.heroImageUrl}
              alt=""
              className="w-full h-full opacity-30"
              style={{
                objectFit: content.heroDisplay?.fit ?? "cover",
                objectPosition: `${content.heroDisplay?.posX ?? 50}% ${content.heroDisplay?.posY ?? 50}%`,
              }}
            />
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
            {content.galleryImages.filter(Boolean).map((src, i) => {
              const d = content.galleryDisplays?.[i];
              const tileHeight = d?.height ?? 0;
              return (
                <div
                  key={i}
                  className={`overflow-hidden rounded-xl border border-border/60 shadow-card bg-card ${tileHeight ? "" : "aspect-[4/3]"}`}
                  style={tileHeight ? { height: `${tileHeight}px` } : undefined}
                >
                  <img
                    src={src}
                    alt=""
                    className="w-full h-full"
                    style={{
                      objectFit: d?.fit ?? "cover",
                      objectPosition: `${d?.posX ?? 50}% ${d?.posY ?? 50}%`,
                    }}
                    loading="lazy"
                  />
                </div>
              );
            })}
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
          <div className="mt-12 space-y-8">
            {featuredCompanies.length > 1 && (
              <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Choose company</p>
                <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                  <SelectTrigger className="h-12 w-full rounded-full border-border/60 bg-card/70 px-5 text-base">
                    <SelectValue placeholder="Select company" />
                  </SelectTrigger>
                  <SelectContent>
                    {featuredCompanies.map(({ company }) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {activeCompanySection && (
              <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4 px-1">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Company</p>
                    <h3 className="mt-2 font-display text-3xl md:text-4xl">{activeCompanySection.company.name}</h3>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-card/70 px-5 py-4 shadow-card">
                    <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Daily limit</p>
                    <div className="mt-2 flex items-center gap-3">
                      <GlassWater className="h-7 w-7 text-primary-glow" />
                      <p className="font-display text-3xl">{activeCompanySection.company.daily_drink_limit}</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {activeCompanySection.cards.map((card) => (
                    <div
                      key={card.id}
                      className="group relative min-h-[440px] overflow-hidden rounded-3xl border border-border/60 bg-card text-left shadow-card"
                    >
                      {card.imageUrl ? (
                        <img
                          src={card.imageUrl}
                          alt={card.name}
                          className="absolute inset-0 h-full w-full object-cover"
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
                        </div>

                        <div className="mt-auto space-y-4">
                          <div>
                            <p className="text-xs uppercase tracking-[0.25em] text-white/75">{card.category}</p>
                            <h4 className="mt-2 font-display text-3xl text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.45)]">{card.name}</h4>
                          </div>
                          <p className="max-w-[28ch] text-sm leading-6 text-white/85 drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)]">
                            {card.description || "Select this drink to generate your member QR."}
                          </p>
                          <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3">
                            <span className="text-sm text-white/80">
                              {card.price_label || (card.status === "included" ? "Included in membership" : "Visible on menu")}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {featuredCompanies.length === 0 && (
              <div className="rounded-3xl border border-dashed border-border/60 bg-card p-6 text-center text-sm text-muted-foreground">
                No front-page drink cards are selected yet.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="container mx-auto px-4 py-24 text-center max-w-2xl">
        {content.closingImageUrl && (
          <div
            className="mb-8 overflow-hidden rounded-2xl border border-border/60 shadow-velvet bg-card"
            style={{ height: `${content.closingDisplay?.height ?? 320}px` }}
          >
            <img
              src={content.closingImageUrl}
              alt=""
              className="w-full h-full"
              style={{
                objectFit: content.closingDisplay?.fit ?? "cover",
                objectPosition: `${content.closingDisplay?.posX ?? 50}% ${content.closingDisplay?.posY ?? 50}%`,
              }}
              loading="lazy"
            />
          </div>
        )}
        <Sparkles className="mx-auto h-6 w-6 text-primary-glow" />
        <h2 className="mt-4 font-display text-4xl md:text-5xl">{content.closingHeading}</h2>
        <p className="mt-3 text-muted-foreground">{content.closingBody}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/dashboard"><Button size="lg" className="bg-gradient-primary shadow-glow">Open my card</Button></Link>
        </div>
      </section>

      {/* External link footer band */}
      {content.closingLinkUrl && content.closingLinkLabel && (
        <section className="border-t border-border/60 bg-gradient-to-b from-velvet/40 to-background">
          <div className="container mx-auto px-4 py-14 md:py-20 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Interested in more?</p>
            <a
              href={content.closingLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-block w-full sm:w-auto"
            >
              <Button
                size="lg"
                className="w-full sm:w-auto bg-gradient-primary shadow-glow text-lg md:text-xl px-10 md:px-14 py-7 md:py-8 h-auto font-display tracking-wide"
              >
                {content.closingLinkLabel}
              </Button>
            </a>
          </div>
        </section>
      )}
    </main>
  );
}
