import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({ component: Signup });

function ageFromDob(dob: string): number {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return -1;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

const schema = z.object({
  full_name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(30).optional(),
  password: z.string().min(8).max(72),
  date_of_birth: z
    .string()
    .min(1, { message: "Please enter your date of birth" })
    .refine((v) => ageFromDob(v) >= 21, {
      message: "You must be at least 21 years old to join.",
    }),
});

function Signup() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: {
          full_name: parsed.data.full_name,
          phone: parsed.data.phone ?? "",
          date_of_birth: parsed.data.date_of_birth,
        },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (data.session) {
      toast.success("Welcome to Velvet Lounge.");
      router.navigate({ to: "/dashboard" });
    } else {
      toast.success("Account created. Check your email to confirm, then sign in.");
      router.navigate({ to: "/login" });
    }
  }

  return (
    <main className="container mx-auto flex min-h-[80vh] max-w-md items-center px-4 py-16">
      <form onSubmit={onSubmit} className="w-full rounded-xl border border-border/60 bg-card p-8 shadow-velvet">
        <h1 className="font-display text-3xl">Become a member</h1>
        <p className="mt-1 text-sm text-muted-foreground">Two cocktails a day. Every day.</p>
        <div className="mt-6 space-y-4">
          <div><Label htmlFor="full_name">Full name</Label><Input id="full_name" name="full_name" required /></div>
          <div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required autoComplete="email" /></div>
          <div><Label htmlFor="phone">Phone (optional)</Label><Input id="phone" name="phone" type="tel" autoComplete="tel" /></div>
          <div>
            <Label htmlFor="date_of_birth">Date of birth</Label>
            <Input id="date_of_birth" name="date_of_birth" type="date" required max={new Date().toISOString().split("T")[0]} />
            <p className="mt-1 text-xs text-muted-foreground">You must be 21 or older to become a member.</p>
          </div>
          <div><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" /></div>
          <Button disabled={busy} className="w-full bg-gradient-primary shadow-glow">{busy ? "Creating…" : "Create account"}</Button>
          <p className="text-center text-sm text-muted-foreground">
            Already a member? <Link to="/login" className="text-primary-glow hover:underline">Sign in</Link>
          </p>
        </div>
      </form>
    </main>
  );
}
