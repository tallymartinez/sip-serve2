import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GlassWater, Sparkles, Star, Wine, Beer, ChevronDown } from "lucide-react";

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

const cocktailSections: { heading: string; subtitle?: string; items: { name: string; notes: string; price?: string }[] }[] = [
  {
    heading: "Bright & Bubbly",
    items: [
      { name: "First Class", notes: "evan williams bourbon, aperol, amaro nonino, peach, mint, prosecco, lemon" },
      { name: "Green Goose", notes: "grey goose la poire, st. germain, soda" },
    ],
  },
  {
    heading: "Playful & Confident",
    items: [
      { name: "Snake in the Grass", notes: "palomo mezcal, reposado tequila, green pepper cordial, boomsma, lime" },
      { name: "Mint to Be", notes: "prairie organic gin, appleton estate rum, cucumber cordial, coconut, lime — clarified" },
      { name: "Work Wife", notes: "gray whale gin, lime, strawberry, cucumber, fennel foam" },
    ],
  },
  {
    heading: "Boozy & Timeless",
    items: [
      { name: "All Bark Some Bite", notes: "cherry bark infused bourbon, st. elizabeth allspice dram, maraschino liqueur, maple, walnut", price: "19" },
      { name: "Clear Conscience", notes: "grey goose berry rouge, aperol, passion fruit, guava, lemon — clarified", price: "19" },
      { name: "Black Magik", notes: "george dickel rye, blended scotch, averna, masala, orange bitters", price: "19" },
    ],
  },
  {
    heading: "Crowd Pleasers",
    items: [
      { name: "Crowd Pleaser", notes: "grainger organic vodka, lillet blanc, lemon, blueberry shrub, rosemary, vanilla" },
      { name: "Shrub Life", notes: "blanco tequila, chareau aloe liqueur, lime, pineapple shrub, mint" },
      { name: "Pura Vida", notes: "blanco tequila, pierre ferrand dry curaçao, habanero, tamarind, pomegranate foam" },
    ],
  },
  {
    heading: "Tiki Time",
    items: [
      { name: "Papa's Painkiller", notes: "pilar blonde rum, mango nectar, pineapple, lime, falernum, amaro di angostura" },
      { name: "Bleak Midwinter", notes: "new riff bonded bourbon, pineapple, espresso, cinnamon, allspice, lime" },
    ],
  },
  {
    heading: "Zero Proof",
    items: [
      { name: "Welcome to the Shruburbs", notes: "seedlip spice 94, pineapple shrub, lime", price: "14" },
      { name: "Cucumber Medley", notes: "seedlip grove 42, cucumber cordial, lime", price: "14" },
    ],
  },
  {
    heading: "Luxury Classics",
    subtitle: "Not included with O.V. Cocktail Club membership",
    items: [
      { name: "Angel's Envy Rye Old Fashioned", notes: "", price: "28" },
      { name: "WhistlePig 10 Rye Manhattan", notes: "", price: "32" },
      { name: "Monkey 47 or Beluga Gold Line Martini", notes: "", price: "26 | 32" },
      { name: "Casa Dragones Blanco Margarita", notes: "", price: "26" },
    ],
  },
];

const supperClubSections: { heading: string; subtitle?: string; items: { name: string; notes: string; price?: string }[] }[] = [
  {
    heading: "Supper Club Signatures",
    subtitle: "$18",
    items: [
      { name: "Red Light District", notes: "nolet's silver · rhubarb bitters · lemon · yuzu · pink peppercorn syrup" },
      { name: "All That & A Bag of Chips", notes: "volcan reposado · fassionola · mint · orgeat · coconut · soda" },
      { name: "Puebla Hothouse", notes: "del maguey \"vida\" · cilantro · lime · agave · dried chili" },
      { name: "Garden Gnome", notes: "ketel one vodka · tarragon · sencha · jasmine pearls · wildflower honey · candied lemon" },
      { name: "19th Hole", notes: "johnnie walker \"black cask\" · honey simple · citrus · soda" },
      { name: "The Parisian", notes: "brenne french single malt · lillet blanc · elderflower liqueur · orange bitters" },
      { name: "No Sleep 'Til Brooklyn", notes: "ardbeg \"wee beastie\" · torched grapefruit · lavender · walnut" },
      { name: "Pull the Rip Cord", notes: "woodinville rye · bib & tucker 6 year bourbon · house vermouth · cherry bark-vanilla bitters" },
    ],
  },
  {
    heading: "Low- & No-ABV",
    subtitle: "$15",
    items: [
      { name: "Gather Beverage Company", notes: "consciously-crafted, chef-inspired, whole ingredients only. herbal, functional elixirs. zero alcohol. based in fort myers. — tart heart · words of wisdom" },
      { name: "Hoodwinked (Zero-Proof)", notes: "aplos \"ease\" n/a spirit · fassionola · mint · orgeat · coconut · soda" },
      { name: "How Low Can You Go? (Zero-Proof)", notes: "gather bev. coffee-caramel · cold brew extract · ritual n/a rum" },
      { name: "Count Your Blessings (Low-ABV)", notes: "palo cortado · cherry bark-vanilla bitters · demerara · cola" },
      { name: "Careful Whisper (Low-ABV)", notes: "cardamaro · dry vermouth · cocchi \"storico\" · orange bitters · angostura" },
    ],
  },
];

const beers = [
  { name: "High 5 IPA", origin: "Fort Myers, FL", price: "9" },
  { name: "Peroni Nastro Azzurro Pilsner", origin: "Vigevano, IT", price: "8" },
  { name: "Allagash White Wheat", origin: "Portland, ME", price: "9" },
  { name: "Guinness Stout", origin: "Dublin, IE", price: "9" },
  { name: "Miller Lite Lager", origin: "Milwaukee, WI", price: "8" },
  { name: "Samuel Adams Lager", origin: "Boston, MA", price: "9" },
  { name: "Athletic Lite (NA)", origin: "Stratford, CT", price: "8" },
];

function Home() {
  const [cocktailsOpen, setCocktailsOpen] = useState(false);
  const [supperOpen, setSupperOpen] = useState(false);
  const [beerOpen, setBeerOpen] = useState(false);
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

      {/* Cocktail menu */}
      <section className="bg-velvet/30 border-y border-border/40">
        <div className="container mx-auto px-4 py-20">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground inline-flex items-center gap-2"><Star className="h-3.5 w-3.5 text-primary-glow" /> The list</p>
            <h2 className="mt-3 font-display text-4xl md:text-5xl">Cocktails</h2>
            <p className="mt-3 text-muted-foreground">$18 unless noted otherwise. Crafted nightly at Old Vines at Mercato.</p>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              size="lg"
              onClick={() => setCocktailsOpen((o) => !o)}
              className="bg-gradient-primary shadow-glow"
              aria-expanded={cocktailsOpen}
            >
              Mercato Cocktails
              <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${cocktailsOpen ? "rotate-180" : ""}`} />
            </Button>
            <Button
              size="lg"
              onClick={() => setSupperOpen((o) => !o)}
              variant="outline"
              aria-expanded={supperOpen}
            >
              Supper Club Cocktails
              <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${supperOpen ? "rotate-180" : ""}`} />
            </Button>
          </div>
          {cocktailsOpen && (
          <div className="mt-14 space-y-14 max-w-5xl mx-auto">
            {cocktailSections.map((section) => (
              <div key={section.heading}>
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
            ))}
          </div>
          )}
          {supperOpen && (
          <div className="mt-14 space-y-14 max-w-5xl mx-auto">
            {supperClubSections.map((section) => (
              <div key={section.heading}>
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
            ))}
          </div>
          )}
        </div>
      </section>

      {/* Beer */}
      <section className="container mx-auto px-4 py-20 max-w-4xl">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground inline-flex items-center gap-2"><Beer className="h-3.5 w-3.5 text-primary-glow" /> On tap & bottled</p>
          <h2 className="mt-3 font-display text-4xl md:text-5xl">Beer</h2>
          <div className="mt-6 flex justify-center">
            <Button
              onClick={() => setBeerOpen((o) => !o)}
              variant="outline"
              aria-expanded={beerOpen}
            >
              Mercato Beer
              <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${beerOpen ? "rotate-180" : ""}`} />
            </Button>
          </div>
        </div>
        {beerOpen && (
          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            {beers.map((b) => (
              <div key={b.name} className="flex items-baseline justify-between gap-3 border-b border-border/40 py-3">
                <div>
                  <p className="font-medium">{b.name}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{b.origin}</p>
                </div>
                <span className="text-sm text-primary-glow font-medium">${b.price}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Wine teaser */}
      <section className="bg-velvet/30 border-y border-border/40">
        <div className="container mx-auto px-4 py-16 text-center max-w-2xl">
          <Wine className="mx-auto h-6 w-6 text-primary-glow" />
          <h2 className="mt-4 font-display text-3xl md:text-4xl">Wine by the glass</h2>
          <p className="mt-3 text-muted-foreground">Sparkling, white, rosé and red — Prosecco, Albariño, Pinot Noir, Cabernet, and our award-winning cellar selection. Ask your server for the full list.</p>
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
