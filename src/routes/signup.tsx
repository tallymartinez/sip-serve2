import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isDemoMode, setStoredDemoAuth } from "@/lib/demo";
import { useAuth } from "@/hooks/useAuth";
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
  referral_code: z.string().trim().max(40).optional(),
});

type ValidatedCode = {
  id: string;
  code: string;
  discount_type: "fixed" | "percent" | null;
  discount_value: number | null;
  assigned_to_name: string | null;
};

function Signup() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [refInput, setRefInput] = useState("");
  const [refValidating, setRefValidating] = useState(false);
  const [refValid, setRefValid] = useState<ValidatedCode | null>(null);
  const [refError, setRefError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      router.navigate({ to: "/" });
    }
  }, [loading, user, router]);

  if (!loading && user) return null;

  async function checkCode() {
    const code = refInput.trim();
    setRefError(null);
    setRefValid(null);
    if (!code) return;

    if (isDemoMode) {
      setRefValidating(true);
      setTimeout(() => {
        setRefValidating(false);
        setRefValid({
          id: "demo-code",
          code,
          discount_type: "percent",
          discount_value: 10,
          assigned_to_name: "Demo Referrer",
        });
      }, 250);
      return;
    }

    setRefValidating(true);
    const { data, error } = await supabase.rpc("validate_referral_code", { _code: code });
    setRefValidating(false);
    if (error) {
      setRefError("Could not check code");
      return;
    }
    const row = (data ?? [])[0] as ValidatedCode | undefined;
    if (!row) {
      setRefError("Invalid, expired, or fully used code");
      return;
    }
    setRefValid(row);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);

    if (isDemoMode) {
      setStoredDemoAuth({
        role: "member",
        email: parsed.data.email.toLowerCase(),
        fullName: parsed.data.full_name,
      });
      toast.success("Demo member created.");
      router.navigate({ to: "/dashboard" });
      return;
    }

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
    if (error) {
      setBusy(false);
      return toast.error(error.message);
    }

    const codeToRedeem = parsed.data.referral_code?.trim();
    if (codeToRedeem && data.session) {
      const { error: rErr } = await supabase.rpc("redeem_referral_code", { _code: codeToRedeem });
      if (rErr) toast.warning(`Account created, but referral code could not be applied: ${rErr.message}`);
      else toast.success("Referral code applied.");
    }

    setBusy(false);
    if (data.session) {
      toast.success("Welcome to Velvet Lounge.");
      router.navigate({ to: "/dashboard" });
    } else {
      toast.success(
        codeToRedeem
          ? "Account created. Check your email to confirm, then sign in - your referral code will be applied on first login."
          : "Account created. Check your email to confirm, then sign in.",
      );
      if (codeToRedeem) {
        try {
          localStorage.setItem("pending_referral_code", codeToRedeem);
        } catch {
          // noop
        }
      }
      router.navigate({ to: "/login" });
    }
  }

  return (
    <main className="container mx-auto flex min-h-[80vh] max-w-md items-center px-4 py-16">
      <form onSubmit={onSubmit} className="w-full rounded-xl border border-border/60 bg-card p-8 shadow-velvet">
        <h1 className="font-display text-3xl">Become a member</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isDemoMode ? "Demo mode is on. Creating an account signs you straight into a local mock member." : "Two cocktails a day. Every day."}
        </p>
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
          <div>
            <Label htmlFor="referral_code">Referral code (optional)</Label>
            <div className="flex gap-2">
              <Input
                id="referral_code"
                name="referral_code"
                value={refInput}
                onChange={(e) => {
                  setRefInput(e.target.value);
                  setRefValid(null);
                  setRefError(null);
                }}
                placeholder="ENTER CODE"
                maxLength={40}
                autoCapitalize="characters"
                className="uppercase tracking-widest"
              />
              <Button type="button" variant="outline" onClick={checkCode} disabled={!refInput.trim() || refValidating}>
                {refValidating ? "Checking..." : "Apply"}
              </Button>
            </div>
            {refValid && (
              <p className="mt-1 text-xs text-success">
                {refValid.discount_type === "percent" && refValid.discount_value != null
                  ? `${refValid.discount_value}% off`
                  : refValid.discount_type === "fixed" && refValid.discount_value != null
                    ? `$${(refValid.discount_value / 100).toFixed(2)} off`
                    : "Code applied"}
                {refValid.assigned_to_name ? ` - referred by ${refValid.assigned_to_name}` : ""}
              </p>
            )}
            {refError && <p className="mt-1 text-xs text-destructive">{refError}</p>}
          </div>
          <Button disabled={busy} className="w-full bg-gradient-primary shadow-glow">{busy ? "Creating..." : "Create account"}</Button>
          <p className="text-center text-sm text-muted-foreground">
            Already a member? <Link to="/login" className="text-primary-glow hover:underline">Sign in</Link>
          </p>
        </div>
      </form>
    </main>
  );
}
