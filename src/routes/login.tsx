import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back");
    router.navigate({ to: "/dashboard" });
  }

  return (
    <main className="container mx-auto flex min-h-[80vh] max-w-md items-center px-4 py-16">
      <form onSubmit={onSubmit} className="w-full rounded-xl border border-border/60 bg-card p-8 shadow-velvet">
        <h1 className="font-display text-3xl">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">Welcome back to the lounge.</p>
        <div className="mt-6 space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <Button disabled={busy} className="w-full bg-gradient-primary shadow-glow">{busy ? "Signing in…" : "Sign in"}</Button>
          <p className="text-center text-sm text-muted-foreground">
            New here? <Link to="/signup" className="text-primary-glow hover:underline">Become a member</Link>
          </p>
        </div>
      </form>
    </main>
  );
}
