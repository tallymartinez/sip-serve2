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
import { ShieldOff, ShieldCheck, Pencil, Plus, Copy, Check, Trash2, KeyRound, UserPlus, X } from "lucide-react";

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/login" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roles) throw redirect({ to: "/dashboard" });
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
interface Employee { id: string; full_name: string; employee_code: string; active: boolean; drinks: number; drinks_all: number; }
interface AdminUser { user_id: string; email: string; full_name: string; }

function Admin() {
  const { isAdmin, loading } = useAuth();
  const [range, setRange] = useState<Range>("day");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [overrideCode, setOverrideCode] = useState("");
  const [overrideEdit, setOverrideEdit] = useState("");

  const since = useMemo(() => rangeStart(range), [range]);

  async function loadAll() {
    const [profiles, redemps, allRedemps, emps, adminRoles, settings] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("redemptions").select("*").gte("redeemed_date", since).order("redeemed_at", { ascending: false }),
      supabase.from("redemptions").select("employee_id,drinks_redeemed"),
      supabase.from("employees").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id").eq("role", "admin"),
      supabase.from("admin_settings").select("override_code").eq("id", true).maybeSingle(),
    ]);

    const empMap = new Map((emps.data ?? []).map((e) => [e.id, e.full_name]));
    const profMap = new Map((profiles.data ?? []).map((p) => [p.id, p]));

    const tally = new Map<string, number>();
    for (const r of redemps.data ?? []) tally.set(r.user_id, (tally.get(r.user_id) ?? 0) + r.drinks_redeemed);

    const empTally = new Map<string, number>();
    for (const r of redemps.data ?? []) {
      if (!r.employee_id) continue;
      empTally.set(r.employee_id, (empTally.get(r.employee_id) ?? 0) + r.drinks_redeemed);
    }

    const empTallyAll = new Map<string, number>();
    for (const r of allRedemps.data ?? []) {
      if (!r.employee_id) continue;
      empTallyAll.set(r.employee_id, (empTallyAll.get(r.employee_id) ?? 0) + r.drinks_redeemed);
    }

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
    setEmployees((emps.data ?? []).map((e) => ({
      id: e.id,
      full_name: e.full_name,
      employee_code: e.employee_code,
      active: e.active,
      drinks: empTally.get(e.id) ?? 0,
      drinks_all: empTallyAll.get(e.id) ?? 0,
    })));

    const adminIds = (adminRoles.data ?? []).map((r) => r.user_id);
    setAdmins(adminIds.map((uid) => {
      const p = profMap.get(uid);
      return { user_id: uid, email: p?.email ?? "(unknown)", full_name: p?.full_name ?? "" };
    }));

    if (settings.data?.override_code) {
      setOverrideCode(settings.data.override_code);
      setOverrideEdit(settings.data.override_code);
    }
  }

  useEffect(() => { if (isAdmin) loadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [isAdmin, since]);

  if (loading) return <main className="container mx-auto px-4 py-16">Loading…</main>;
  if (!isAdmin) {
    return (
      <main className="container mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-display text-2xl">Admins only</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You need an admin account to manage members and servers.
        </p>
      </main>
    );
  }

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
    if (!payload.full_name || !payload.employee_code) return toast.error("Name and ID required");
    const { error } = await supabase.from("employees").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Server added"); loadAll();
  }

  async function toggleEmployee(e: Employee) {
    const { error } = await supabase.from("employees").update({ active: !e.active }).eq("id", e.id);
    if (error) return toast.error(error.message);
    loadAll();
  }

  async function saveEmployee(form: FormData) {
    if (!editingEmp) return;
    const patch = {
      full_name: String(form.get("emp_name") ?? "").trim().slice(0, 100),
      employee_code: String(form.get("emp_code") ?? "").trim().slice(0, 40),
    };
    if (!patch.full_name || !patch.employee_code) return toast.error("Name and ID required");
    const { error } = await supabase.from("employees").update(patch).eq("id", editingEmp.id);
    if (error) return toast.error(error.message);
    toast.success("Server updated");
    setEditingEmp(null); loadAll();
  }

  async function copyCode(code: string, id: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch {
      toast.error("Could not copy");
    }
  }

  async function undoRedemption(l: LogRow) {
    if (!confirm(`Undo this redemption (${l.drinks_redeemed} drink${l.drinks_redeemed > 1 ? "s" : ""} for ${l.member_name || l.member_email})?`)) return;
    const { error } = await supabase.from("redemptions").delete().eq("id", l.id);
    if (error) return toast.error(error.message);
    toast.success("Redemption undone");
    loadAll();
  }

  async function promoteAdmin(form: FormData) {
    const email = String(form.get("admin_email") ?? "").trim().toLowerCase();
    if (!email) return toast.error("Enter an email");
    const { data: uid, error } = await supabase.rpc("find_user_id_by_email", { _email: email });
    if (error) return toast.error(error.message);
    if (!uid) return toast.error("No user with that email — they must sign up first");
    const { error: insErr } = await supabase.from("user_roles").insert({ user_id: uid, role: "admin" });
    if (insErr) {
      if (insErr.code === "23505") return toast.error("Already an admin");
      return toast.error(insErr.message);
    }
    toast.success("Admin granted");
    loadAll();
  }

  async function demoteAdmin(a: AdminUser) {
    if (admins.length <= 1) return toast.error("Cannot remove the last admin");
    if (!confirm(`Remove admin access from ${a.email}?`)) return;
    const { error } = await supabase.from("user_roles").delete().eq("user_id", a.user_id).eq("role", "admin");
    if (error) return toast.error(error.message);
    toast.success("Admin removed");
    loadAll();
  }

  async function saveOverrideCode() {
    const code = overrideEdit.trim();
    if (!/^\d{4,8}$/.test(code)) return toast.error("Code must be 4–8 digits");
    const { error } = await supabase.from("admin_settings").update({ override_code: code, updated_at: new Date().toISOString() }).eq("id", true);
    if (error) return toast.error(error.message);
    toast.success("Override code updated");
    setOverrideCode(code);
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
          <TabsTrigger value="employees">Servers</TabsTrigger>
          <TabsTrigger value="admins">Admins</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
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
                  <TableHead>Server</TableHead><TableHead className="text-right">Drinks</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-muted-foreground">{new Date(l.redeemed_at).toLocaleString()}</TableCell>
                    <TableCell>{l.member_name || l.member_email}</TableCell>
                    <TableCell>{l.employee_name}</TableCell>
                    <TableCell className="text-right">{l.drinks_redeemed}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => undoRedemption(l)} title="Undo redemption">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {logs.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No redemptions in range</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="employees" className="mt-4 space-y-4">
          <form
            onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); addEmployee(fd); e.currentTarget.reset(); }}
            className="rounded-xl border border-border/60 bg-card p-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
          >
            <div><Label htmlFor="emp_name">Server name</Label><Input id="emp_name" name="emp_name" required /></div>
            <div><Label htmlFor="emp_code">Server ID</Label><Input id="emp_code" name="emp_code" placeholder="EMP-1234" required /></div>
            <Button type="submit" className="self-end bg-gradient-primary"><Plus className="h-4 w-4 mr-1" />Add</Button>
          </form>
          <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Server ID</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Drinks ({range === "day" ? "today" : range === "week" ? "7d" : "30d"})</TableHead><TableHead className="text-right">All-time</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {employees.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{e.full_name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{e.employee_code}</span>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => copyCode(e.employee_code, e.id)} title="Copy server ID">
                          {copiedId === e.id ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell><Badge className={e.active ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}>{e.active ? "active" : "inactive"}</Badge></TableCell>
                    <TableCell className="text-right font-medium">{e.drinks}</TableCell>
                    <TableCell className="text-right font-medium">{e.drinks_all}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditingEmp(e)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="outline" onClick={() => toggleEmployee(e)}>{e.active ? "Deactivate" : "Activate"}</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {employees.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No servers yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="admins" className="mt-4 space-y-4">
          <form
            onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); promoteAdmin(fd); e.currentTarget.reset(); }}
            className="rounded-xl border border-border/60 bg-card p-4 grid gap-3 sm:grid-cols-[1fr_auto]"
          >
            <div>
              <Label htmlFor="admin_email">Promote user to admin</Label>
              <Input id="admin_email" name="admin_email" type="email" placeholder="user@example.com" required />
              <p className="mt-1 text-xs text-muted-foreground">User must already have an account.</p>
            </div>
            <Button type="submit" className="self-end bg-gradient-primary"><UserPlus className="h-4 w-4 mr-1" />Grant admin</Button>
          </form>
          <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {admins.map((a) => (
                  <TableRow key={a.user_id}>
                    <TableCell>{a.full_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{a.email}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => demoteAdmin(a)} disabled={admins.length <= 1}>
                        <X className="h-4 w-4 mr-1" />Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {admins.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No admins</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-4 space-y-4">
          <div className="rounded-xl border border-border/60 bg-card p-6 max-w-xl">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary-glow" />
              <h2 className="font-display text-xl">Override code</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              A master code that can unlock the staff redemption terminal in place of the standard staff PIN — for troubleshooting or when staff forget the code. 4–8 digits.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
              <div>
                <Label htmlFor="override">Current code</Label>
                <Input
                  id="override"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  value={overrideEdit}
                  onChange={(e) => setOverrideEdit(e.target.value.replace(/\D/g, ""))}
                  className="font-mono text-lg tracking-[0.3em]"
                />
              </div>
              <Button onClick={saveOverrideCode} disabled={overrideEdit === overrideCode} className="self-end bg-gradient-primary">
                Save
              </Button>
            </div>
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

      <Dialog open={!!editingEmp} onOpenChange={(o) => !o && setEditingEmp(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit server</DialogTitle></DialogHeader>
          {editingEmp && (
            <form onSubmit={(e) => { e.preventDefault(); saveEmployee(new FormData(e.currentTarget)); }} className="space-y-3">
              <div><Label htmlFor="emp_name_edit">Server name</Label><Input id="emp_name_edit" name="emp_name" defaultValue={editingEmp.full_name} required /></div>
              <div><Label htmlFor="emp_code_edit">Server ID</Label><Input id="emp_code_edit" name="emp_code" defaultValue={editingEmp.employee_code} required /></div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingEmp(null)}>Cancel</Button>
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
