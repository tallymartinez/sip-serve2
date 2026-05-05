import type { Session, User } from "@supabase/supabase-js";

export type DemoRole = "member" | "admin" | "manager" | "server" | "super_admin";

export interface DemoAuthState {
  email: string;
  fullName: string;
  role: DemoRole;
}

export const isDemoMode = import.meta.env.VITE_DEMO_MODE === "true";

const DEMO_AUTH_KEY = "ovwc:demo-auth";
export const DEMO_AUTH_EVENT = "ovwc:demo-auth-changed";

export const DEMO_TIER = {
  total_members: 24,
  next_signup_number: 25,
  price_cents: 8000,
  spots_left_in_tier: 76,
};

export const DEMO_COMPANY = {
  id: "demo-company",
  name: "Old Vines Cocktail Club",
  daily_drink_limit: 2,
};

export const DEMO_COMPANIES = [
  DEMO_COMPANY,
  {
    id: "demo-company-2",
    name: "Mercato Club",
    daily_drink_limit: 1,
  },
];

export const DEMO_VENUES = [
  { id: "demo-venue-1", name: "Old Vines Lounge", address: "123 Main St" },
  { id: "demo-venue-2", name: "Mercato Bar", address: "456 Oak Ave" },
];

export const DEMO_MANAGER_LOGS = [
  {
    id: "log-1",
    redeemed_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    drinks_redeemed: 2,
    user_id: "demo-member",
    venue_id: "demo-venue-1",
    employee_id: "demo-employee",
    member_name: "Taylor Demo",
    member_email: "member@demo.local",
    venue_name: "Old Vines Lounge",
    employee_name: "Sam Server",
  },
  {
    id: "log-2",
    redeemed_at: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    drinks_redeemed: 1,
    user_id: "demo-member-2",
    venue_id: "demo-venue-2",
    employee_id: "demo-employee",
    member_name: "Jordan Example",
    member_email: "jordan@demo.local",
    venue_name: "Mercato Bar",
    employee_name: "Sam Server",
  },
];

export function inferDemoRole(email: string): DemoRole {
  const normalized = email.toLowerCase();
  if (normalized.includes("super")) return "super_admin";
  if (normalized.includes("admin")) return "admin";
  if (normalized.includes("manager")) return "manager";
  if (normalized.includes("staff") || normalized.includes("employee") || normalized.includes("server")) return "server";
  return "member";
}

export function getDemoRoles(role: DemoRole): DemoRole[] {
  return [role];
}

export function getStoredDemoAuth(): DemoAuthState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DEMO_AUTH_KEY);
    return raw ? (JSON.parse(raw) as DemoAuthState) : null;
  } catch {
    return null;
  }
}

export function setStoredDemoAuth(auth: DemoAuthState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEMO_AUTH_KEY, JSON.stringify(auth));
  window.dispatchEvent(new CustomEvent(DEMO_AUTH_EVENT));
}

export function clearStoredDemoAuth() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DEMO_AUTH_KEY);
  window.dispatchEvent(new CustomEvent(DEMO_AUTH_EVENT));
}

export function createDemoUser(auth: DemoAuthState): User {
  return {
    id: `demo-${auth.role}`,
    email: auth.email,
    user_metadata: { full_name: auth.fullName },
    app_metadata: { provider: "demo" },
    aud: "authenticated",
    role: "authenticated",
    created_at: new Date(0).toISOString(),
  } as User;
}

export function createDemoSession(auth: DemoAuthState): Session {
  return {
    access_token: "demo-access-token",
    refresh_token: "demo-refresh-token",
    expires_in: 60 * 60,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    token_type: "bearer",
    user: createDemoUser(auth),
  } as Session;
}
