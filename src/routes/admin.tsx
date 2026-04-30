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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ShieldOff, ShieldCheck, Pencil, Plus, Copy, Check, Trash2, KeyRound, UserPlus, X, Store, Pause, Play, Eye, EyeOff, Building2, Download, BarChart3, RefreshCw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/login" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .in("role", ["admin", "super_admin"]);
    if (!roles || roles.length === 0) throw redirect({ to: "/dashboard" });
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

interface Company {
  id: string;
  name: string;
  daily_drink_limit: number;
  redemptions_paused: boolean;
  paused_message: string | null;
  active: boolean;
}
interface Venue {
  id: string;
  company_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  venue_pin: string;
  active: boolean;
}
interface MemberRow {
  id: string; full_name: string; email: string; phone: string | null;
  subscription_status: string; subscription_started_at: string | null;
  drinks: number; company_id: string | null;
}
interface LogRow {
  id: string; redeemed_at: string; drinks_redeemed: number;
  user_id: string; employee_id: string | null; venue_id: string | null;
  member_name: string; member_email: string; employee_name: string; venue_name: string;
}
interface Employee { id: string; full_name: string; employee_code: string; active: boolean; venue_id: string | null; venue_name: string; drinks: number; drinks_all: number; }
interface AdminUser { user_id: string; email: string; full_name: string; }
interface OverrideUse { id: string; used_at: string; admin_user_id: string; admin_email: string; member_id: string | null; member_name: string; }

function Admin() {
  const { isAdmin, loading, user } = useAuth();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [range, setRange] = useState<Range>("day");
  const [venueFilter, setVenueFilter] = useState<string>("all");

  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null);
  const [showVenuePin, setShowVenuePin] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [myCode, setMyCode] = useState("");
  const [myCodeEdit, setMyCodeEdit] = useState("");
  const [overrideUses, setOverrideUses] = useState<OverrideUse[]>([]);

  const since = useMemo(() => rangeStart(range), [range]);
  const activeCompany = companies.find((c) => c.id === activeCompanyId) ?? null;
  const companyVenues = venues.filter((v) => v.company_id === activeCompanyId);

  // Detect super admin
  useEffect(() => {
    if (!user) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "super_admin").maybeSingle()
      .then(({ data }) => setIsSuperAdmin(!!data));
  }, [user]);

  // Load companies once user is known
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data } = await supabase.from("companies").select("*").order("name");
      const list = (data ?? []) as Company[];
      setCompanies(list);
      if (list.length > 0 && !activeCompanyId) setActiveCompanyId(list[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function loadAll() {
    if (!activeCompanyId) return;
    const venueIdsQ = supabase.from("venues").select("*").eq("company_id", activeCompanyId).order("name");
    const profilesQ = supabase.from("profiles").select("*").eq("company_id", activeCompanyId).order("created_at", { ascending: false });
    const empsQ = supabase.from("employees").select("*").eq("company_id", activeCompanyId).order("created_at", { ascending: false });
    const adminRolesQ = supabase.from("user_roles").select("user_id").eq("role", "admin").eq("company_id", activeCompanyId);
    const myCodeQ = user ? supabase.from("admin_codes").select("code").eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null });
    const usesQ = supabase.from("override_uses").select("*").order("used_at", { ascending: false }).limit(50);

    const [vRes, pRes, eRes, arRes, mcRes, uRes] = await Promise.all([venueIdsQ, profilesQ, empsQ, adminRolesQ, myCodeQ, usesQ]);

    const vList = (vRes.data ?? []) as Venue[];
    setVenues((prev) => {
      // keep venues from other companies the super admin may have loaded; replace this company's venues
      const others = prev.filter((x) => x.company_id !== activeCompanyId);
      return [...others, ...vList];
    });
    const venueIds = vList.map((v) => v.id);
    const venueNameMap = new Map(vList.map((v) => [v.id, v.name]));

    // Redemptions for this company's venues
    let rangeRedemps: { id: string; user_id: string; employee_id: string | null; venue_id: string | null; drinks_redeemed: number; redeemed_at: string }[] = [];
    let allRedemps: { employee_id: string | null; drinks_redeemed: number }[] = [];
    if (venueIds.length > 0) {
      const [rRes, allRes] = await Promise.all([
        supabase.from("redemptions").select("id,user_id,employee_id,venue_id,drinks_redeemed,redeemed_at").in("venue_id", venueIds).gte("redeemed_date", since).order("redeemed_at", { ascending: false }),
        supabase.from("redemptions").select("employee_id,drinks_redeemed").in("venue_id", venueIds),
      ]);
      rangeRedemps = rRes.data ?? [];
      allRedemps = allRes.data ?? [];
    }

    const empMap = new Map((eRes.data ?? []).map((e) => [e.id, e.full_name]));
    const profMap = new Map((pRes.data ?? []).map((p) => [p.id, p]));

    const tally = new Map<string, number>();
    for (const r of rangeRedemps) tally.set(r.user_id, (tally.get(r.user_id) ?? 0) + r.drinks_redeemed);

    const empTally = new Map<string, number>();
    for (const r of rangeRedemps) {
      if (!r.employee_id) continue;
      empTally.set(r.employee_id, (empTally.get(r.employee_id) ?? 0) + r.drinks_redeemed);
    }
    const empTallyAll = new Map<string, number>();
    for (const r of allRedemps) {
      if (!r.employee_id) continue;
      empTallyAll.set(r.employee_id, (empTallyAll.get(r.employee_id) ?? 0) + r.drinks_redeemed);
    }

    setMembers((pRes.data ?? []).map((p) => ({
      id: p.id, full_name: p.full_name ?? "", email: p.email, phone: p.phone,
      subscription_status: p.subscription_status, subscription_started_at: p.subscription_started_at,
      drinks: tally.get(p.id) ?? 0, company_id: p.company_id,
    })));

    setLogs(rangeRedemps.map((r) => {
      const m = profMap.get(r.user_id);
      return {
        id: r.id, redeemed_at: r.redeemed_at, drinks_redeemed: r.drinks_redeemed,
        user_id: r.user_id, employee_id: r.employee_id, venue_id: r.venue_id,
        member_name: m?.full_name ?? "", member_email: m?.email ?? "",
        employee_name: r.employee_id ? (empMap.get(r.employee_id) ?? "—") : "—",
        venue_name: r.venue_id ? (venueNameMap.get(r.venue_id) ?? "—") : "—",
      };
    }));

    setEmployees((eRes.data ?? []).map((e) => ({
      id: e.id,
      full_name: e.full_name,
      employee_code: e.employee_code,
      active: e.active,
      venue_id: e.venue_id,
      venue_name: e.venue_id ? (venueNameMap.get(e.venue_id) ?? "—") : "—",
      drinks: empTally.get(e.id) ?? 0,
      drinks_all: empTallyAll.get(e.id) ?? 0,
    })));

    const adminIds = (arRes.data ?? []).map((r) => r.user_id);
    setAdmins(adminIds.map((uid) => {
      const p = profMap.get(uid);
      return { user_id: uid, email: p?.email ?? "(unknown)", full_name: p?.full_name ?? "" };
    }));

    const codeVal = (mcRes.data as { code?: string } | null)?.code ?? "";
    setMyCode(codeVal);
    setMyCodeEdit(codeVal);

    setOverrideUses((uRes.data ?? []).map((u) => {
      const adminProfile = profMap.get(u.admin_user_id);
      const memberProfile = u.member_id ? profMap.get(u.member_id) : null;
      return {
        id: u.id,
        used_at: u.used_at,
        admin_user_id: u.admin_user_id,
        admin_email: adminProfile?.email ?? "(unknown)",
        member_id: u.member_id,
        member_name: memberProfile?.full_name || memberProfile?.email || "—",
      };
    }));
  }

  useEffect(() => { if (isAdmin && activeCompanyId) loadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [isAdmin, activeCompanyId, since]);

  if (loading) return <main className="container mx-auto px-4 py-16">Loading…</main>;
  if (!isAdmin) {
    return (
      <main className="container mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-display text-2xl">Admins only</h1>
        <p className="mt-2 text-sm text-muted-foreground">You need an admin account to manage members and servers.</p>
      </main>
    );
  }

  const filteredLogs = venueFilter === "all" ? logs : logs.filter((l) => l.venue_id === venueFilter);
  const totalDrinks = filteredLogs.reduce((s, l) => s + l.drinks_redeemed, 0);
  const activeCount = members.filter((m) => m.subscription_status === "active").length;

  // ===== Company / venue actions =====
  async function createCompany(form: FormData) {
    const name = String(form.get("company_name") ?? "").trim();
    if (!name) return toast.error("Company name required");
    const { data, error } = await supabase.from("companies").insert({ name }).select().single();
    if (error) return toast.error(error.message);
    toast.success(`Company "${name}" created`);
    setCompanies((c) => [...c, data as Company]);
    setActiveCompanyId(data.id);
  }

  async function saveCompany(patch: Partial<Company>) {
    if (!activeCompany) return;
    const { error } = await supabase.from("companies").update(patch).eq("id", activeCompany.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Company saved");
    setCompanies((cs) => cs.map((c) => (c.id === activeCompany.id ? { ...c, ...patch } : c)));
  }

  async function addVenue(form: FormData) {
    if (!activeCompanyId) return;
    const name = String(form.get("venue_name") ?? "").trim();
    if (!name) return toast.error("Venue name required");
    const { error } = await supabase.from("venues").insert({ company_id: activeCompanyId, name });
    if (error) return toast.error(error.message);
    toast.success("Venue added");
    loadAll();
  }

  async function saveVenue(patch: Partial<Venue>) {
    if (!editingVenue) return;
    if (patch.venue_pin && !/^\d{4,8}$/.test(patch.venue_pin)) { toast.error("PIN must be 4–8 digits"); return; }
    const { error } = await supabase.from("venues").update(patch).eq("id", editingVenue.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Venue saved");
    setEditingVenue(null);
    loadAll();
  }

  async function toggleVenueActive(v: Venue) {
    const { error } = await supabase.from("venues").update({ active: !v.active }).eq("id", v.id);
    if (error) return toast.error(error.message);
    loadAll();
  }

  // ===== Existing actions adapted =====
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
    if (!activeCompanyId) return;
    const venue_id = String(form.get("emp_venue") ?? "");
    const payload = {
      full_name: String(form.get("emp_name") ?? "").trim().slice(0, 100),
      employee_code: String(form.get("emp_code") ?? "").trim().slice(0, 40),
      company_id: activeCompanyId,
      venue_id: venue_id || null,
    };
    if (!payload.full_name || !payload.employee_code) return toast.error("Name and ID required");
    if (!payload.venue_id) return toast.error("Choose a venue");
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
    const venue_id = String(form.get("emp_venue") ?? "");
    const patch = {
      full_name: String(form.get("emp_name") ?? "").trim().slice(0, 100),
      employee_code: String(form.get("emp_code") ?? "").trim().slice(0, 40),
      venue_id: venue_id || null,
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
    if (!activeCompanyId) return;
    const email = String(form.get("admin_email") ?? "").trim().toLowerCase();
    if (!email) return toast.error("Enter an email");
    const { data: uid, error } = await supabase.rpc("find_user_id_by_email", { _email: email });
    if (error) return toast.error(error.message);
    if (!uid) return toast.error("No user with that email — they must sign up first");
    const { error: insErr } = await supabase.from("user_roles").insert({ user_id: uid, role: "admin", company_id: activeCompanyId });
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
    if (!activeCompanyId) return;
    const { error } = await supabase.from("user_roles").delete().eq("user_id", a.user_id).eq("role", "admin").eq("company_id", activeCompanyId);
    if (error) return toast.error(error.message);
    toast.success("Admin removed");
    loadAll();
  }

  async function saveMyCode() {
    if (!user) return;
    const code = myCodeEdit.trim();
    if (!/^\d{4,8}$/.test(code)) return toast.error("Code must be 4–8 digits");
    const { error } = await supabase
      .from("admin_codes")
      .upsert({ user_id: user.id, code, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) {
      if (error.code === "23505") return toast.error("Another admin is already using that code");
      return toast.error(error.message);
    }
    toast.success("Your override code updated");
    setMyCode(code);
  }

  return (
    <main className="container mx-auto px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Admin</h1>
          <p className="text-sm text-muted-foreground">Members, redemptions, staff, and venues.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {companies.length > 0 && (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary-glow" />
              <Select value={activeCompanyId ?? ""} onValueChange={(v) => { setActiveCompanyId(v); setVenueFilter("all"); }}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Select company" /></SelectTrigger>
                <SelectContent>
                  {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
            <TabsList>
              <TabsTrigger value="day">Today</TabsTrigger>
              <TabsTrigger value="week">7 days</TabsTrigger>
              <TabsTrigger value="month">30 days</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {companyVenues.length > 1 && (
        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Filter venue:</span>
          <Select value={venueFilter} onValueChange={setVenueFilter}>
            <SelectTrigger className="w-56 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All venues</SelectItem>
              {companyVenues.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Members" value={members.length} />
        <Stat label="Active subscriptions" value={activeCount} />
        <Stat label={venueFilter === "all" ? "Drinks served (range)" : "Drinks at venue (range)"} value={totalDrinks} />
      </div>

      <Tabs defaultValue="members" className="mt-8">
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="logs">Redemption log</TabsTrigger>
          <TabsTrigger value="venue-data">Venue data</TabsTrigger>
          <TabsTrigger value="employees">Servers</TabsTrigger>
          <TabsTrigger value="venues">Venues</TabsTrigger>
          <TabsTrigger value="admins">Admins</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* ===== Members ===== */}
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

        {/* ===== Logs ===== */}
        <TabsContent value="logs" className="mt-4">
          <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead><TableHead>Venue</TableHead><TableHead>Member</TableHead>
                  <TableHead>Server</TableHead><TableHead className="text-right">Drinks</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-muted-foreground">{new Date(l.redeemed_at).toLocaleString()}</TableCell>
                    <TableCell><Badge variant="outline">{l.venue_name}</Badge></TableCell>
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
                {filteredLogs.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No redemptions in range</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ===== Venue Data ===== */}
        <TabsContent value="venue-data" className="mt-4">
          <VenueDataPanel venues={companyVenues} employees={employees} />
        </TabsContent>

        {/* ===== Employees ===== */}
        <TabsContent value="employees" className="mt-4 space-y-4">
          <form
            onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); addEmployee(fd); e.currentTarget.reset(); }}
            className="rounded-xl border border-border/60 bg-card p-4 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
          >
            <div><Label htmlFor="emp_name">Server name</Label><Input id="emp_name" name="emp_name" required /></div>
            <div><Label htmlFor="emp_code">Server ID</Label><Input id="emp_code" name="emp_code" placeholder="EMP-1234" required /></div>
            <div>
              <Label htmlFor="emp_venue">Venue</Label>
              <select id="emp_venue" name="emp_venue" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Select venue…</option>
                {companyVenues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <Button type="submit" className="self-end bg-gradient-primary"><Plus className="h-4 w-4 mr-1" />Add</Button>
          </form>
          <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Server ID</TableHead><TableHead>Venue</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Drinks ({range === "day" ? "today" : range === "week" ? "7d" : "30d"})</TableHead><TableHead className="text-right">All-time</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
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
                    <TableCell><Badge variant="outline">{e.venue_name}</Badge></TableCell>
                    <TableCell><Badge className={e.active ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}>{e.active ? "active" : "inactive"}</Badge></TableCell>
                    <TableCell className="text-right font-medium">{e.drinks}</TableCell>
                    <TableCell className="text-right font-medium">{e.drinks_all}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditingEmp(e)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="outline" onClick={() => toggleEmployee(e)}>{e.active ? "Deactivate" : "Activate"}</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {employees.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No servers yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ===== Venues ===== */}
        <TabsContent value="venues" className="mt-4 space-y-4">
          <form
            onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); addVenue(fd); e.currentTarget.reset(); }}
            className="rounded-xl border border-border/60 bg-card p-4 grid gap-3 sm:grid-cols-[1fr_auto]"
          >
            <div><Label htmlFor="venue_name">Add a new venue</Label><Input id="venue_name" name="venue_name" placeholder="e.g. The Supper Club" required /></div>
            <Button type="submit" className="self-end bg-gradient-primary"><Plus className="h-4 w-4 mr-1" />Add venue</Button>
          </form>

          <div className="grid gap-4 md:grid-cols-2">
            {companyVenues.map((v) => (
              <div key={v.id} className="rounded-xl border border-border/60 bg-card p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Store className="h-5 w-5 text-primary-glow" />
                    <div>
                      <h3 className="font-display text-lg">{v.name}</h3>
                      <p className="text-xs text-muted-foreground">{v.address || "No address set"}</p>
                    </div>
                  </div>
                  <Badge className={v.active ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}>{v.active ? "active" : "inactive"}</Badge>
                </div>
                <div className="mt-4 grid gap-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Staff PIN</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono tracking-[0.3em]">{showVenuePin[v.id] ? v.venue_pin : "••••"}</span>
                      <button type="button" onClick={() => setShowVenuePin((s) => ({ ...s, [v.id]: !s[v.id] }))} className="text-muted-foreground hover:text-foreground">
                        {showVenuePin[v.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      <button type="button" onClick={() => copyCode(v.venue_pin, `pin-${v.id}`)} className="text-muted-foreground hover:text-foreground">
                        {copiedId === `pin-${v.id}` ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  {v.phone && <div className="flex items-center justify-between"><span className="text-muted-foreground">Phone</span><span>{v.phone}</span></div>}
                  {v.email && <div className="flex items-center justify-between"><span className="text-muted-foreground">Email</span><span>{v.email}</span></div>}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => toggleVenueActive(v)}>{v.active ? "Deactivate" : "Activate"}</Button>
                  <Button size="sm" onClick={() => setEditingVenue(v)} className="bg-gradient-primary"><Pencil className="h-4 w-4 mr-1" />Edit</Button>
                </div>
              </div>
            ))}
            {companyVenues.length === 0 && <p className="text-sm text-muted-foreground">No venues yet — add one above.</p>}
          </div>
        </TabsContent>

        {/* ===== Admins ===== */}
        <TabsContent value="admins" className="mt-4 space-y-4">
          <form
            onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); promoteAdmin(fd); e.currentTarget.reset(); }}
            className="rounded-xl border border-border/60 bg-card p-4 grid gap-3 sm:grid-cols-[1fr_auto]"
          >
            <div>
              <Label htmlFor="admin_email">Promote user to admin (for {activeCompany?.name})</Label>
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
                {admins.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No admins for this company</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ===== Settings ===== */}
        <TabsContent value="settings" className="mt-4 space-y-4">
          {/* Company-wide settings */}
          {activeCompany && (
            <div className="rounded-xl border border-border/60 bg-card p-6">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary-glow" />
                <h2 className="font-display text-xl">{activeCompany.name} — program settings</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Daily drink limit applies across all venues in this company.</p>
              <CompanyEditor company={activeCompany} onSave={saveCompany} />
            </div>
          )}

          {/* Super admin: create new company */}
          {isSuperAdmin && (
            <div className="rounded-xl border border-border/60 bg-card p-6">
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary-glow" />
                <h2 className="font-display text-xl">Create a new company</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Spin up a new cocktail program with its own venues, members, and reports.</p>
              <form
                onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); createCompany(fd); e.currentTarget.reset(); }}
                className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]"
              >
                <div><Label htmlFor="company_name">Company name</Label><Input id="company_name" name="company_name" placeholder="e.g. Coastal Hospitality" required /></div>
                <Button type="submit" className="self-end bg-gradient-primary">Create company</Button>
              </form>
            </div>
          )}

          <div className="rounded-xl border border-border/60 bg-card p-6 max-w-xl">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary-glow" />
              <h2 className="font-display text-xl">My override code</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Your personal code unlocks the staff redemption terminal in place of the shared staff PIN. Every use is tracked below. 4–8 digits, unique per admin.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
              <div>
                <Label htmlFor="override">Your code</Label>
                <Input
                  id="override"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  value={myCodeEdit}
                  onChange={(e) => setMyCodeEdit(e.target.value.replace(/\D/g, ""))}
                  placeholder="Not set"
                  className="font-mono text-lg tracking-[0.3em]"
                />
              </div>
              <Button onClick={saveMyCode} disabled={myCodeEdit === myCode || !myCodeEdit} className="self-end bg-gradient-primary">Save</Button>
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
            <div className="px-4 pt-4 pb-2"><h3 className="font-display text-lg">Override usage (last 50)</h3></div>
            <Table>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Admin</TableHead><TableHead>Member</TableHead></TableRow></TableHeader>
              <TableBody>
                {overrideUses.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="text-muted-foreground">{new Date(u.used_at).toLocaleString()}</TableCell>
                    <TableCell>{u.admin_email}</TableCell>
                    <TableCell>{u.member_name}</TableCell>
                  </TableRow>
                ))}
                {overrideUses.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No override uses yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Member edit dialog */}
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

      {/* Employee edit dialog */}
      <Dialog open={!!editingEmp} onOpenChange={(o) => !o && setEditingEmp(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit server</DialogTitle></DialogHeader>
          {editingEmp && (
            <form onSubmit={(e) => { e.preventDefault(); saveEmployee(new FormData(e.currentTarget)); }} className="space-y-3">
              <div><Label htmlFor="emp_name_edit">Server name</Label><Input id="emp_name_edit" name="emp_name" defaultValue={editingEmp.full_name} required /></div>
              <div><Label htmlFor="emp_code_edit">Server ID</Label><Input id="emp_code_edit" name="emp_code" defaultValue={editingEmp.employee_code} required /></div>
              <div>
                <Label htmlFor="emp_venue_edit">Venue</Label>
                <select id="emp_venue_edit" name="emp_venue" defaultValue={editingEmp.venue_id ?? ""} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">— none —</option>
                  {companyVenues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingEmp(null)}>Cancel</Button>
                <Button type="submit" className="bg-gradient-primary">Save</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Venue edit dialog */}
      <Dialog open={!!editingVenue} onOpenChange={(o) => !o && setEditingVenue(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit venue</DialogTitle></DialogHeader>
          {editingVenue && <VenueEditForm venue={editingVenue} onSave={saveVenue} onCancel={() => setEditingVenue(null)} />}
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

function CompanyEditor({ company, onSave }: { company: Company; onSave: (patch: Partial<Company>) => void | Promise<void> }) {
  const [draft, setDraft] = useState<Company>(company);
  useEffect(() => setDraft(company), [company.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(draft) !== JSON.stringify(company);
  return (
    <div className="mt-5 grid gap-5 md:grid-cols-2">
      <div className="md:col-span-2">
        <Label htmlFor="c_name">Company name</Label>
        <Input id="c_name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="c_limit">Daily drink limit per member (across all venues)</Label>
        <Input id="c_limit" type="number" min={1} max={20} value={draft.daily_drink_limit}
          onChange={(e) => setDraft({ ...draft, daily_drink_limit: Math.max(1, Math.min(20, parseInt(e.target.value || "1", 10))) })} />
      </div>
      <div className="md:col-span-2 rounded-lg border border-border/60 bg-background/40 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {draft.redemptions_paused ? <Pause className="h-5 w-5 text-destructive" /> : <Play className="h-5 w-5 text-success" />}
            <div>
              <p className="font-medium">Pause redemptions</p>
              <p className="text-xs text-muted-foreground">Temporarily block redemptions across all this company's venues.</p>
            </div>
          </div>
          <Switch checked={draft.redemptions_paused} onCheckedChange={(v) => setDraft({ ...draft, redemptions_paused: v })} />
        </div>
        {draft.redemptions_paused && (
          <div className="mt-3">
            <Label htmlFor="c_msg">Message shown to staff</Label>
            <Textarea id="c_msg" rows={2} value={draft.paused_message ?? ""}
              onChange={(e) => setDraft({ ...draft, paused_message: e.target.value })}
              placeholder="Closed for a private event tonight." />
          </div>
        )}
      </div>
      <div className="md:col-span-2 flex justify-end">
        <Button onClick={() => onSave({ name: draft.name, daily_drink_limit: draft.daily_drink_limit, redemptions_paused: draft.redemptions_paused, paused_message: draft.paused_message?.trim() || null })} disabled={!dirty} className="bg-gradient-primary">Save company settings</Button>
      </div>
    </div>
  );
}

function VenueEditForm({ venue, onSave, onCancel }: { venue: Venue; onSave: (patch: Partial<Venue>) => void | Promise<void>; onCancel: () => void }) {
  const [draft, setDraft] = useState<Venue>(venue);
  const [show, setShow] = useState(false);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave({ name: draft.name.trim(), address: draft.address?.trim() || null, phone: draft.phone?.trim() || null, email: draft.email?.trim() || null, venue_pin: draft.venue_pin.trim() }); }} className="space-y-3">
      <div><Label>Venue name</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required /></div>
      <div>
        <Label>Staff PIN</Label>
        <div className="relative">
          <Input type={show ? "text" : "password"} inputMode="numeric" maxLength={8} value={draft.venue_pin}
            onChange={(e) => setDraft({ ...draft, venue_pin: e.target.value.replace(/\D/g, "") })}
            className="font-mono tracking-[0.3em] pr-10" />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">4–8 digits. Staff type this on the redemption screen.</p>
      </div>
      <div><Label>Address</Label><Input value={draft.address ?? ""} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Phone</Label><Input value={draft.phone ?? ""} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></div>
        <div><Label>Email</Label><Input type="email" value={draft.email ?? ""} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" className="bg-gradient-primary">Save venue</Button>
      </DialogFooter>
    </form>
  );
}
