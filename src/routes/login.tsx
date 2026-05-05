import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inferDemoRole, isDemoMode, setStoredDemoAuth, type DemoRole } from "@/lib/demo";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.navigate({ to: "/" });
    }
  }, [loading, user, router]);

  if (!loading && user) return null;

  function signInDemo(role: DemoRole) {
    const normalizedEmail = email.trim().toLowerCase();
    setStoredDemoAuth({
      role,
      email: normalizedEmail || `${role}@demo.local`,
      fullName: normalizedEmail ? normalizedEmail.split("@")[0].replace(/[-_.]/g, " ") : `Demo ${role}`,
    });
    toast.success(`Signed in as demo ${role}`);
    router.navigate({
      to: role === "admin" || role === "super_admin" ? "/admin" : role === "manager" ? "/manager" : role === "server" ? "/staff" : "/dashboard",
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();

    if (isDemoMode) {
      signInDemo(inferDemoRole(email));
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);

    try {
      const pending = localStorage.getItem("pending_referral_code");
      if (pending) {
        const { error: rErr } = await supabase.rpc("redeem_referral_code", { _code: pending });
        localStorage.removeItem("pending_referral_code");
        if (!rErr) toast.success("Referral code applied to your account.");
      }
    } catch {
      // noop
    }

    toast.success("Welcome back");
    router.navigate({ to: "/dashboard" });
  }

  return (
    <main className="container mx-auto flex min-h-[80vh] max-w-md items-center px-4 py-16">
      <form onSubmit={onSubmit} className="w-full rounded-xl border border-border/60 bg-card p-8 shadow-velvet">
        <h1 className="font-display text-3xl">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isDemoMode ? "Demo mode is on. Use any email, or jump into a sample role." : "Welcome back to the lounge."}
        </p>
        <div className="mt-6 space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <Button disabled={busy} className="w-full bg-gradient-primary shadow-glow">
            {busy ? "Signing in..." : "Sign in"}
          </Button>
          {isDemoMode && (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Button type="button" variant="outline" onClick={() => signInDemo("member")}>Demo member</Button>
              <Button type="button" variant="outline" onClick={() => signInDemo("server")}>Demo server</Button>
              <Button type="button" variant="outline" onClick={() => signInDemo("admin")}>Demo admin</Button>
              <Button type="button" variant="outline" onClick={() => signInDemo("super_admin")}>Demo super admin</Button>
            </div>
          )}
          <p className="text-center text-sm text-muted-foreground">
            New here? <Link to="/signup" className="text-primary-glow hover:underline">Become a member</Link>
          </p>
        </div>
      </form>
    </main>
  );
}
