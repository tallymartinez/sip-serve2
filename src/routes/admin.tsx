import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ShieldOff, ShieldCheck, Pencil, Plus } from "lucide-react";

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: Admin,
});

type Range = "day" | "week" | "month";

function rangeStart(r: Range): string {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (r === "week") d.setDate(d.getDate() - 6);
  if (r === "month") d.setDate(d.getDate() - 29);
  return d.toISOString().slice(0, 10);
}

interface MemberRow {
  id: string; full_name: string; email: string; phone: string | null;
  subscription_status: string; subscription_started_at: string | null;
  drinks: number;
}
interface LogRow {
  id: string; redeemed_at: string; drinks_redeemed: number;
  user_id: string; employee_id: string | null;
  member_name: string; member_email: string; employee_name: string;
}
interface Employee { id: string; full_name: string; employee_code: string; active: boolean; }

function Admin() {
  const { isAdmin, loading } = useAuth();
  const [range, setRange] = useState<Range>("day");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editing, setEditing] = useState<MemberRow | null>(null);

  const since = useMemo(() => rangeStart(range), [range]);

  async function loadAll() {
    const [profiles, redemps, emps] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("redemptions").select("*").gte("redeemed_date", since).order("redeemed_at", { ascending: false }),
      supabase.from("employees").select("*").order("created_at", { ascending: false }),
    ]);

    const empMap = new Map((emps.data ?? []).map((e) => [e.id, e.full_name]));
    const profMap = new Map((profiles.data ?? []).map((p) => [p.id, p]));

    const tally = new Map<string, number>();
    for (const r of redemps.data ?? []) tally.set(r.user_id, (tally.get(r.user_id) ?? 0) + r.drinks_redeemed);

    setMembers((profiles.data ?? []).map((p) => ({
      id: p.id, full_name: p.full_name ?? "", email: p.email, phone: p.phone,
      subscription_status: p.subscription_status, subscription_started_at: p.subscription_started_at,
      drinks: tally.get(p.id) ?? 0,
    })));

    setLogs((redemps.data ?? []).map((r) => {
      const m = profMap.get(r.user_id);
      return {
        id: r.id, redeemed_at: r.redeemed_at, drinks_redeemed: r.drinks_redeemed,
        user_id: r.user_id, employee_id: r.employee_id,
        member_name: m?.full_name ?? "", member_email: m?.email ?? "",
        employee_name: r.employee_id ? (empMap.get(r.employee_id) ?? "—") : "—",
      };
    }));
    setEmployees(emps.data ?? []);
  }

  useEffect(() => { if (isAdmin) loadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [isAdmin, since]);

  if (loading) return <main className="container mx-auto px-4 py-16">Loading…</main>;
  if (!isAdmin) return <main className="container mx-auto px-4 py-16">Admins only.</main>;

  const totalDrinks = members.reduce((s, m) => s + m.drinks, 0);
  const activeCount = members.filter((m) => m.subscription_status === "active").length;

  async function toggleStatus(m: MemberRow) {
    const next = m.subscription_status === "active" ? "inactive" : "active";
    const patch: { subscription_status: string; subscription_started_at?: string } = { subscription_status: next };
    if (next === "active" && !m.subscription_started_at) patch.subscription_started_at = new Date().toISOString();
    const { error } = await supabase.from("profiles").update(patch).eq("id", m.id);
    if (error) return toast.error(error.message);
    toast.success(`Member ${next === "active" ? "activated" : "deactivated"}`);
    loadAll();
  }

  async function saveMember(form: FormData) {
    if (!editing) return;
    const patch = {
      full_name: String(form.get("full_name") ?? "").trim().slice(0, 100),
      phone: String(form.get("phone") ?? "").trim().slice(0, 30) || null,
    };
    const { error } = await supabase.from("profiles").update(patch).eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Member updated");
    setEditing(null); loadAll();
  }

  async function addEmployee(form: FormData) {
    const payload = {
      full_name: String(form.get("emp_name") ?? "").trim().slice(0, 100),
      employee_code: String(form.get("emp_code") ?? "").trim().slice(0, 40),
    };
    if (!payload.full_name || !payload.employee_code) return toast.error("Name and code required");
    const { error } = await supabase.from("employees").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Employee added"); loadAll();
  }

  async function toggleEmployee(e: Employee) {
    const { error } = await supabase.from("employees").update({ active: !e.active }).eq("id", e.id);
    if (error) return toast.error(error.message);
    loadAll();
  }

  return (
    <main className="container mx-auto px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Admin</h1>
          <p className="text-sm text-muted-foreground">Members, redemptions, and staff.</p>
        </div>
        <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
          <TabsList>
            <TabsTrigger value="day">Today</TabsTrigger>
            <TabsTrigger value="week">7 days</TabsTrigger>
            <TabsTrigger value="month">30 days</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Members" value={members.length} />
        <Stat label="Active subscriptions" value={activeCount} />
        <Stat label="Drinks served (range)" value={totalDrinks} />
      </div>

      <Tabs defaultValue="members" className="mt-8">
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="logs">Redemption log</TabsTrigger>
          <TabsTrigger value="employees">Employees</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-4">
          <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead><TableHead className="text-right">Drinks</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.full_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{m.email}</TableCell>
                    <TableCell className="text-muted-foreground">{m.phone ?? "—"}</TableCell>
                    <TableCell>
                      <Badge className={m.subscription_status === "active" ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}>
                        {m.subscription_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{m.drinks}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(m)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="outline" onClick={() => toggleStatus(m)}>
                        {m.subscription_status === "active" ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {members.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No members yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead><TableHead>Member</TableHead>
                  <TableHead>Employee</TableHead><TableHead className="text-right">Drinks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-muted-foreground">{new Date(l.redeemed_at).toLocaleString()}</TableCell>
                    <TableCell>{l.member_name || l.member_email}</TableCell>
                    <TableCell>{l.employee_name}</TableCell>
                    <TableCell className="text-right">{l.drinks_redeemed}</TableCell>
                  </TableRow>
                ))}
                {logs.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No redemptions in range</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="employees" className="mt-4 space-y-4">
          <form
            onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); addEmployee(fd); e.currentTarget.reset(); }}
            className="rounded-xl border border-border/60 bg-card p-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
          >
            <div><Label htmlFor="emp_name">Full name</Label><Input id="emp_name" name="emp_name" required /></div>
            <div><Label htmlFor="emp_code">Employee code</Label><Input id="emp_code" name="emp_code" placeholder="EMP-1234" required /></div>
            <Button type="submit" className="self-end bg-gradient-primary"><Plus className="h-4 w-4 mr-1" />Add</Button>
          </form>
          <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Code</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {employees.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{e.full_name}</TableCell>
                    <TableCell className="font-mono">{e.employee_code}</TableCell>
                    <TableCell><Badge className={e.active ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}>{e.active ? "active" : "inactive"}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => toggleEmployee(e)}>{e.active ? "Deactivate" : "Activate"}</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {employees.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No employees yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit member</DialogTitle></DialogHeader>
          {editing && (
            <form onSubmit={(e) => { e.preventDefault(); saveMember(new FormData(e.currentTarget)); }} className="space-y-3">
              <div><Label>Email</Label><Input value={editing.email} disabled /></div>
              <div><Label htmlFor="full_name">Name</Label><Input id="full_name" name="full_name" defaultValue={editing.full_name} /></div>
              <div><Label htmlFor="phone">Phone</Label><Input id="phone" name="phone" defaultValue={editing.phone ?? ""} /></div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button type="submit" className="bg-gradient-primary">Save</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-5">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl">{value}</p>
    </div>
  );
}
