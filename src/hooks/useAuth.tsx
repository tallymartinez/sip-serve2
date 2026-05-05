import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  clearStoredDemoAuth,
  createDemoSession,
  createDemoUser,
  DEMO_AUTH_EVENT,
  getDemoRoles,
  getStoredDemoAuth,
  isDemoMode,
} from "@/lib/demo";

type Role = "admin" | "employee" | "member" | "manager" | "super_admin";
type NormalizedRole = "admin" | "member" | "manager" | "server" | "super_admin";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  roles: NormalizedRole[];
  loading: boolean;
  isAdmin: boolean;
  isServer: boolean;
  isMember: boolean;
  isManager: boolean;
  isSuperAdmin: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<NormalizedRole[]>([]);
  const [loading, setLoading] = useState(true);

  function normalizeRoles(values: string[]): NormalizedRole[] {
    return Array.from(
      new Set(
        values.map((role) => {
          if (role === "employee") return "server";
          return role as NormalizedRole;
        }),
      ),
    );
  }

  useEffect(() => {
    if (isDemoMode) {
      const syncDemoAuth = () => {
        const auth = getStoredDemoAuth();
        setSession(auth ? createDemoSession(auth) : null);
        setUser(auth ? createDemoUser(auth) : null);
        setRoles(auth ? normalizeRoles(getDemoRoles(auth.role)) : []);
        setLoading(false);
      };

      syncDemoAuth();
      const onStorage = () => syncDemoAuth();
      const onDemoAuthChanged = () => syncDemoAuth();
      window.addEventListener("storage", onStorage);
      window.addEventListener(DEMO_AUTH_EVENT, onDemoAuthChanged);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(DEMO_AUTH_EVENT, onDemoAuthChanged);
      };
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        // defer to avoid recursive auth calls
        setTimeout(() => fetchRoles(sess.user.id), 0);
      } else {
        setRoles([]);
      }
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchRoles(session.user.id);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function fetchRoles(uid: string) {
    const [roleResult, ownerResult] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("companies").select("id").eq("owner_user_id", uid).limit(1),
    ]);

    const nextRoles = (roleResult.data ?? []).map((r) => String(r.role));
    if ((ownerResult.data ?? []).length > 0 && !nextRoles.includes("admin")) {
      nextRoles.push("admin");
    }
    setRoles(normalizeRoles(nextRoles));
  }

  async function signOut() {
    if (isDemoMode) {
      clearStoredDemoAuth();
      setSession(null);
      setUser(null);
      setRoles([]);
      return;
    }
    await supabase.auth.signOut();
    setRoles([]);
  }

  return (
    <Ctx.Provider
      value={{
        user, session, roles, loading,
        isAdmin: roles.includes("admin") || roles.includes("super_admin"),
        isServer: roles.includes("server") || roles.includes("admin") || roles.includes("super_admin"),
        isMember: roles.includes("member"),
        isManager: roles.includes("manager"),
        isSuperAdmin: roles.includes("super_admin"),
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
