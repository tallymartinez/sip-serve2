import type { ReactNode } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { defaultHomeContent } from "@/lib/homeContent";

export type Company = Tables<"companies">;
export type DrinkCardRow = Tables<"drink_cards">;

export interface DisplayDrinkCard {
  id: string;
  company_id: string;
  name: string;
  description: string;
  category: string;
  price_label: string | null;
  status: "included" | "not_included" | "inactive";
  imageUrl: string;
}

const imageModules = import.meta.glob("../../Images/*.{jpg,JPG,jpeg,JPEG,png,PNG}", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const imageUrls = Object.entries(imageModules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, value]) => value);

export const headerImages = imageUrls.slice(0, Math.min(4, imageUrls.length));
export const drinkImages = imageUrls.slice(Math.min(4, imageUrls.length)).length
  ? imageUrls.slice(Math.min(4, imageUrls.length))
  : imageUrls;

export function pickImage(list: string[], index: number) {
  if (list.length === 0) return "";
  return list[index % list.length];
}

export function buildFallbackDrinkCards(companyId: string): DisplayDrinkCard[] {
  let counter = 0;
  return defaultHomeContent.cocktailSections.flatMap((section) =>
    section.items.map((item) => {
      const card: DisplayDrinkCard = {
        id: `fallback-${companyId}-${counter}`,
        company_id: companyId,
        name: item.name,
        description: item.notes,
        category: section.heading,
        price_label: item.price ? `$${item.price}` : "$18",
        status: section.heading === "Luxury Classics" ? "not_included" : "included",
        imageUrl: pickImage(drinkImages, counter),
      };
      counter += 1;
      return card;
    }),
  );
}

export function mapDrinkCards(companies: Company[], rows: DrinkCardRow[]): DisplayDrinkCard[] {
  if (rows.length > 0) {
    return rows.map((row, index) => ({
      id: row.id,
      company_id: row.company_id,
      name: row.name,
      description: row.description ?? "",
      category: row.category,
      price_label: row.price_label,
      status: row.status,
      imageUrl: row.image_url ?? pickImage(drinkImages, index),
    }));
  }

  return companies.flatMap((company) => buildFallbackDrinkCards(company.id));
}

export function statusBadge(status: DisplayDrinkCard["status"]): ReactNode {
  if (status === "included") return <Badge className="bg-success text-success-foreground">Included</Badge>;
  if (status === "not_included") return <Badge variant="outline" className="border-border/70">Not included</Badge>;
  return null;
}
