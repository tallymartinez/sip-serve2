export interface CocktailItem { name: string; notes: string; price?: string }
export interface CocktailSection { heading: string; subtitle?: string; items: CocktailItem[] }
export type ImageFit = "cover" | "contain";
export interface ImageDisplay {
  url: string;
  fit?: ImageFit;          // cover (fill, may crop) or contain (fit whole image)
  posX?: number;           // 0-100, horizontal focal point
  posY?: number;           // 0-100, vertical focal point
  height?: number;         // px, applies to gallery tile / closing image
}
export interface HomeContent {
  welcomeHeading: string;
  welcomeParagraphs: string[];
  welcomeSignoff: string;
  cocktailsIntro: string;
  cocktailSections: CocktailSection[];
  supperClubSections: CocktailSection[];
  closingHeading: string;
  closingBody: string;
  heroImageUrl?: string;
  galleryImages?: string[];
  closingImageUrl?: string;
  // New: per-image display settings (optional, fall back to sensible defaults)
  heroDisplay?: Omit<ImageDisplay, "url">;
  galleryDisplays?: Array<Omit<ImageDisplay, "url">>;
  closingDisplay?: Omit<ImageDisplay, "url">;
}

export const defaultHomeContent: HomeContent = {
  welcomeHeading: "Welcome to Old Vines Cocktail Club",
  welcomeParagraphs: [
    "There's something special about gathering around a well-made drink—the quiet ritual of preparation, the first sip, the stories that follow. At Old Vines, we believe cocktails are more than recipes; they're a bridge between past and present, a way to honor tradition while exploring something new.",
    "As a member, you're now part of a community that appreciates craftsmanship, curiosity, and good company. Here, we celebrate the depth of aged spirits, the character of thoughtfully sourced ingredients, and the subtle art of balance in every glass. Whether you're a seasoned enthusiast or just beginning your journey, there's always something new to discover.",
    "Expect evenings filled with conversation, experimentation, and the occasional surprise. Share your favorites, learn from others, and don't be afraid to challenge convention—some of the best cocktails come from unexpected twists.",
    "Pull up a chair, raise a glass, and make yourself at home.",
  ],
  welcomeSignoff: "Cheers,\nOld Vines Cocktail Club",
  cocktailsIntro: "$18 unless noted otherwise. Crafted nightly at Old Vines at Mercato.",
  cocktailSections: [
    { heading: "Bright & Bubbly", items: [
      { name: "First Class", notes: "evan williams bourbon, aperol, amaro nonino, peach, mint, prosecco, lemon" },
      { name: "Green Goose", notes: "grey goose la poire, st. germain, soda" },
    ]},
    { heading: "Playful & Confident", items: [
      { name: "Snake in the Grass", notes: "palomo mezcal, reposado tequila, green pepper cordial, boomsma, lime" },
      { name: "Mint to Be", notes: "prairie organic gin, appleton estate rum, cucumber cordial, coconut, lime — clarified" },
      { name: "Work Wife", notes: "gray whale gin, lime, strawberry, cucumber, fennel foam" },
    ]},
    { heading: "Boozy & Timeless", items: [
      { name: "All Bark Some Bite", notes: "cherry bark infused bourbon, st. elizabeth allspice dram, maraschino liqueur, maple, walnut", price: "19" },
      { name: "Clear Conscience", notes: "grey goose berry rouge, aperol, passion fruit, guava, lemon — clarified", price: "19" },
      { name: "Black Magik", notes: "george dickel rye, blended scotch, averna, masala, orange bitters", price: "19" },
    ]},
    { heading: "Crowd Pleasers", items: [
      { name: "Crowd Pleaser", notes: "grainger organic vodka, lillet blanc, lemon, blueberry shrub, rosemary, vanilla" },
      { name: "Shrub Life", notes: "blanco tequila, chareau aloe liqueur, lime, pineapple shrub, mint" },
      { name: "Pura Vida", notes: "blanco tequila, pierre ferrand dry curaçao, habanero, tamarind, pomegranate foam" },
    ]},
    { heading: "Tiki Time", items: [
      { name: "Papa's Painkiller", notes: "pilar blonde rum, mango nectar, pineapple, lime, falernum, amaro di angostura" },
      { name: "Bleak Midwinter", notes: "new riff bonded bourbon, pineapple, espresso, cinnamon, allspice, lime" },
    ]},
    { heading: "Zero Proof", items: [
      { name: "Welcome to the Shruburbs", notes: "seedlip spice 94, pineapple shrub, lime", price: "14" },
      { name: "Cucumber Medley", notes: "seedlip grove 42, cucumber cordial, lime", price: "14" },
    ]},
    { heading: "Luxury Classics", subtitle: "Not included with O.V. Cocktail Club membership", items: [
      { name: "Angel's Envy Rye Old Fashioned", notes: "", price: "28" },
      { name: "WhistlePig 10 Rye Manhattan", notes: "", price: "32" },
      { name: "Monkey 47 or Beluga Gold Line Martini", notes: "", price: "26 | 32" },
      { name: "Casa Dragones Blanco Margarita", notes: "", price: "26" },
    ]},
  ],
  supperClubSections: [
    { heading: "Supper Club Signatures", subtitle: "$18", items: [
      { name: "Red Light District", notes: "nolet's silver · rhubarb bitters · lemon · yuzu · pink peppercorn syrup" },
      { name: "All That & A Bag of Chips", notes: "volcan reposado · fassionola · mint · orgeat · coconut · soda" },
      { name: "Puebla Hothouse", notes: "del maguey \"vida\" · cilantro · lime · agave · dried chili" },
      { name: "Garden Gnome", notes: "ketel one vodka · tarragon · sencha · jasmine pearls · wildflower honey · candied lemon" },
      { name: "19th Hole", notes: "johnnie walker \"black cask\" · honey simple · citrus · soda" },
      { name: "The Parisian", notes: "brenne french single malt · lillet blanc · elderflower liqueur · orange bitters" },
      { name: "No Sleep 'Til Brooklyn", notes: "ardbeg \"wee beastie\" · torched grapefruit · lavender · walnut" },
      { name: "Pull the Rip Cord", notes: "woodinville rye · bib & tucker 6 year bourbon · house vermouth · cherry bark-vanilla bitters" },
    ]},
    { heading: "Low- & No-ABV", subtitle: "$15", items: [
      { name: "Gather Beverage Company", notes: "consciously-crafted, chef-inspired, whole ingredients only. herbal, functional elixirs. zero alcohol. based in fort myers. — tart heart · words of wisdom" },
      { name: "Hoodwinked (Zero-Proof)", notes: "aplos \"ease\" n/a spirit · fassionola · mint · orgeat · coconut · soda" },
      { name: "How Low Can You Go? (Zero-Proof)", notes: "gather bev. coffee-caramel · cold brew extract · ritual n/a rum" },
      { name: "Count Your Blessings (Low-ABV)", notes: "palo cortado · cherry bark-vanilla bitters · demerara · cola" },
      { name: "Careful Whisper (Low-ABV)", notes: "cardamaro · dry vermouth · cocchi \"storico\" · orange bitters · angostura" },
    ]},
  ],
  closingHeading: "Pull up a stool.",
  closingBody: "Two cocktails every day, on the house, for the price of a decent bottle of wine. Membership is intentionally small.",
  heroImageUrl: "",
  galleryImages: [],
  closingImageUrl: "",
};

export function mergeHomeContent(partial: Partial<HomeContent> | null | undefined): HomeContent {
  if (!partial || typeof partial !== "object") return defaultHomeContent;
  return { ...defaultHomeContent, ...partial };
}
