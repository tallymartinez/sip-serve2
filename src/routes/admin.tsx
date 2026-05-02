import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
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
import { ShieldOff, ShieldCheck, Pencil, Plus, Copy, Check, Trash2, KeyRound, UserPlus, X, Store, Pause, Play, Eye, EyeOff, Building2, Download, BarChart3, RefreshCw, Ticket, Power } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { defaultHomeContent, mergeHomeContent, type HomeContent, type ImageDisplay } from "@/lib/homeContent";

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
          {isSuperAdmin && <TabsTrigger value="managers">Managers</TabsTrigger>}
          <TabsTrigger value="referrals">Referrals</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="home">Home page</TabsTrigger>
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

        {/* ===== Referrals ===== */}
        <TabsContent value="referrals" className="mt-4">
          {activeCompanyId && <ReferralCodesPanel companyId={activeCompanyId} members={members} />}
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

        {/* ===== Home page content ===== */}
        <TabsContent value="home" className="mt-4">
          <HomeContentEditor />
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

type VenueRedemption = {
  id: string;
  redeemed_at: string;
  redeemed_date: string;
  drinks_redeemed: number;
  user_id: string;
  employee_id: string | null;
  member_name: string;
  member_email: string;
  member_phone: string;
  employee_name: string;
  employee_code: string;
};

function todayISO() { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString().slice(0,10); }
function daysAgoISO(n: number) { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - n); return d.toISOString().slice(0,10); }

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function downloadCSV(filename: string, rows: (string | number | null | undefined)[][]) {
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function VenueDataPanel({ venues, employees }: { venues: Venue[]; employees: Employee[] }) {
  const [venueId, setVenueId] = useState<string>(venues[0]?.id ?? "");
  const [from, setFrom] = useState<string>(daysAgoISO(29));
  const [to, setTo] = useState<string>(todayISO());
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [allTime, setAllTime] = useState(false);
  const [rows, setRows] = useState<VenueRedemption[]>([]);
  const [loading, setLoading] = useState(false);
  const [liveRows, setLiveRows] = useState<VenueRedemption[]>([]);

  useEffect(() => {
    if (venues.length > 0 && !venues.find((v) => v.id === venueId)) setVenueId(venues[0].id);
  }, [venues, venueId]);

  const venue = venues.find((v) => v.id === venueId) ?? null;
  const venueEmployees = employees.filter((e) => e.venue_id === venueId);

  async function load() {
    if (!venueId) return;
    setLoading(true);
    try {
      let q = supabase.from("redemptions")
        .select("id,redeemed_at,redeemed_date,drinks_redeemed,user_id,employee_id")
        .eq("venue_id", venueId)
        .order("redeemed_at", { ascending: false });
      if (!allTime) q = q.gte("redeemed_date", from).lte("redeemed_date", to);
      if (employeeFilter !== "all") q = q.eq("employee_id", employeeFilter);
      const { data: reds, error } = await q;
      if (error) { toast.error(error.message); setRows([]); return; }
      const list = reds ?? [];
      const userIds = Array.from(new Set(list.map((r) => r.user_id)));
      const empIds = Array.from(new Set(list.map((r) => r.employee_id).filter(Boolean) as string[]));
      const [profRes, empRes] = await Promise.all([
        userIds.length ? supabase.from("profiles").select("id,full_name,email,phone").in("id", userIds) : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string; phone: string | null }[] }),
        empIds.length ? supabase.from("employees").select("id,full_name,employee_code").in("id", empIds) : Promise.resolve({ data: [] as { id: string; full_name: string; employee_code: string }[] }),
      ]);
      const pMap = new Map((profRes.data ?? []).map((p) => [p.id, p]));
      const eMap = new Map((empRes.data ?? []).map((e) => [e.id, e]));
      setRows(list.map((r) => {
        const p = pMap.get(r.user_id);
        const e = r.employee_id ? eMap.get(r.employee_id) : null;
        return {
          id: r.id, redeemed_at: r.redeemed_at, redeemed_date: r.redeemed_date,
          drinks_redeemed: r.drinks_redeemed, user_id: r.user_id, employee_id: r.employee_id,
          member_name: p?.full_name ?? "", member_email: p?.email ?? "", member_phone: p?.phone ?? "",
          employee_name: e?.full_name ?? "", employee_code: e?.employee_code ?? "",
        };
      }));
    } finally { setLoading(false); }
  }

  // Load when filters change
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [venueId, from, to, employeeFilter, allTime]);

  // Live feed: latest 25 today, refresh every 15s
  useEffect(() => {
    if (!venueId) return;
    let cancelled = false;
    async function fetchLive() {
      const { data: reds } = await supabase.from("redemptions")
        .select("id,redeemed_at,redeemed_date,drinks_redeemed,user_id,employee_id")
        .eq("venue_id", venueId)
        .order("redeemed_at", { ascending: false })
        .limit(25);
      const list = reds ?? [];
      const userIds = Array.from(new Set(list.map((r) => r.user_id)));
      const empIds = Array.from(new Set(list.map((r) => r.employee_id).filter(Boolean) as string[]));
      const [profRes, empRes] = await Promise.all([
        userIds.length ? supabase.from("profiles").select("id,full_name,email,phone").in("id", userIds) : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string; phone: string | null }[] }),
        empIds.length ? supabase.from("employees").select("id,full_name,employee_code").in("id", empIds) : Promise.resolve({ data: [] as { id: string; full_name: string; employee_code: string }[] }),
      ]);
      const pMap = new Map((profRes.data ?? []).map((p) => [p.id, p]));
      const eMap = new Map((empRes.data ?? []).map((e) => [e.id, e]));
      if (cancelled) return;
      setLiveRows(list.map((r) => {
        const p = pMap.get(r.user_id);
        const e = r.employee_id ? eMap.get(r.employee_id) : null;
        return {
          id: r.id, redeemed_at: r.redeemed_at, redeemed_date: r.redeemed_date,
          drinks_redeemed: r.drinks_redeemed, user_id: r.user_id, employee_id: r.employee_id,
          member_name: p?.full_name ?? "", member_email: p?.email ?? "", member_phone: p?.phone ?? "",
          employee_name: e?.full_name ?? "", employee_code: e?.employee_code ?? "",
        };
      }));
    }
    fetchLive();
    const ch = supabase.channel(`venue-live-${venueId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "redemptions", filter: `venue_id=eq.${venueId}` }, () => fetchLive())
      .subscribe();
    const iv = setInterval(fetchLive, 15000);
    return () => { cancelled = true; clearInterval(iv); supabase.removeChannel(ch); };
  }, [venueId]);

  // Aggregations
  const totals = useMemo(() => {
    const totalDrinks = rows.reduce((s, r) => s + r.drinks_redeemed, 0);
    const uniqueMembers = new Set(rows.map((r) => r.user_id)).size;
    const visits = rows.length;
    return { totalDrinks, uniqueMembers, visits };
  }, [rows]);

  const memberSummary = useMemo(() => {
    const m = new Map<string, { name: string; email: string; phone: string; visits: number; drinks: number; last: string }>();
    for (const r of rows) {
      const cur = m.get(r.user_id);
      if (cur) {
        cur.visits += 1; cur.drinks += r.drinks_redeemed;
        if (r.redeemed_at > cur.last) cur.last = r.redeemed_at;
      } else {
        m.set(r.user_id, { name: r.member_name, email: r.member_email, phone: r.member_phone, visits: 1, drinks: r.drinks_redeemed, last: r.redeemed_at });
      }
    }
    return Array.from(m.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.drinks - a.drinks);
  }, [rows]);

  const employeeSummary = useMemo(() => {
    const m = new Map<string, { name: string; code: string; redemptions: number; drinks: number }>();
    for (const r of rows) {
      if (!r.employee_id) continue;
      const cur = m.get(r.employee_id);
      if (cur) { cur.redemptions += 1; cur.drinks += r.drinks_redeemed; }
      else m.set(r.employee_id, { name: r.employee_name, code: r.employee_code, redemptions: 1, drinks: r.drinks_redeemed });
    }
    return Array.from(m.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.drinks - a.drinks);
  }, [rows]);

  const dailyTotals = useMemo(() => {
    const m = new Map<string, { drinks: number; visits: number; members: Set<string> }>();
    for (const r of rows) {
      const cur = m.get(r.redeemed_date);
      if (cur) { cur.drinks += r.drinks_redeemed; cur.visits += 1; cur.members.add(r.user_id); }
      else m.set(r.redeemed_date, { drinks: r.drinks_redeemed, visits: 1, members: new Set([r.user_id]) });
    }
    return Array.from(m.entries()).map(([date, v]) => ({ date, drinks: v.drinks, visits: v.visits, members: v.members.size }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [rows]);

  const fileSuffix = venue ? venue.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() : "venue";
  const rangeSuffix = allTime ? "all-time" : `${from}_to_${to}`;

  function exportRedemptions() {
    const header = ["redeemed_at","date","venue","member_name","member_email","member_phone","drinks","server_name","server_id"];
    const data = rows.map((r) => [r.redeemed_at, r.redeemed_date, venue?.name ?? "", r.member_name, r.member_email, r.member_phone, r.drinks_redeemed, r.employee_name, r.employee_code]);
    downloadCSV(`redemptions_${fileSuffix}_${rangeSuffix}.csv`, [header, ...data]);
  }
  function exportMembers() {
    const header = ["member_name","email","phone","visits","total_drinks","last_visit"];
    const data = memberSummary.map((m) => [m.name, m.email, m.phone, m.visits, m.drinks, m.last]);
    downloadCSV(`members_${fileSuffix}_${rangeSuffix}.csv`, [header, ...data]);
  }
  function exportEmployees() {
    const header = ["server_name","server_id","redemptions","drinks_served"];
    const data = employeeSummary.map((e) => [e.name, e.code, e.redemptions, e.drinks]);
    downloadCSV(`servers_${fileSuffix}_${rangeSuffix}.csv`, [header, ...data]);
  }
  function exportDaily() {
    const header = ["date","drinks","visits","unique_members"];
    const data = dailyTotals.map((d) => [d.date, d.drinks, d.visits, d.members]);
    downloadCSV(`daily_${fileSuffix}_${rangeSuffix}.csv`, [header, ...data]);
  }

  if (venues.length === 0) {
    return <p className="text-sm text-muted-foreground">No venues yet — add one in the Venues tab.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="rounded-xl border border-border/60 bg-card p-4 grid gap-3 md:grid-cols-[1fr_auto_auto_1fr_auto] items-end">
        <div>
          <Label>Venue</Label>
          <Select value={venueId} onValueChange={setVenueId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {venues.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="from">From</Label>
          <Input id="from" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setAllTime(false); }} disabled={allTime} />
        </div>
        <div>
          <Label htmlFor="to">To</Label>
          <Input id="to" type="date" value={to} onChange={(e) => { setTo(e.target.value); setAllTime(false); }} disabled={allTime} />
        </div>
        <div>
          <Label>Server</Label>
          <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All servers</SelectItem>
              {venueEmployees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={allTime} onCheckedChange={setAllTime} id="all-time" />
          <Label htmlFor="all-time" className="cursor-pointer">All time</Label>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Drinks served" value={totals.totalDrinks} />
        <Stat label="Redemption visits" value={totals.visits} />
        <Stat label="Unique members" value={totals.uniqueMembers} />
      </div>

      {/* Export buttons */}
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Download className="h-4 w-4 text-primary-glow" />
          <h3 className="font-display text-lg">Export to CSV</h3>
          <span className="text-xs text-muted-foreground ml-auto">{allTime ? "All time" : `${from} → ${to}`}{employeeFilter !== "all" && " · filtered by server"}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportRedemptions} className="bg-gradient-primary"><Download className="h-4 w-4 mr-1" />Redemptions ({rows.length})</Button>
          <Button onClick={exportMembers} variant="outline"><Download className="h-4 w-4 mr-1" />Member visits ({memberSummary.length})</Button>
          <Button onClick={exportEmployees} variant="outline"><Download className="h-4 w-4 mr-1" />Server activity ({employeeSummary.length})</Button>
          <Button onClick={exportDaily} variant="outline"><Download className="h-4 w-4 mr-1" />Daily totals ({dailyTotals.length})</Button>
        </div>
      </div>

      {/* Live feed */}
      <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
        <div className="px-4 pt-4 pb-2 flex items-center gap-2">
          <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span></span>
          <h3 className="font-display text-lg">Live feed — {venue?.name}</h3>
          <span className="text-xs text-muted-foreground ml-auto">Updates in real time · last 25 redemptions</span>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Member</TableHead><TableHead>Email</TableHead><TableHead>Server</TableHead><TableHead className="text-right">Drinks</TableHead></TableRow></TableHeader>
          <TableBody>
            {liveRows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-muted-foreground">{new Date(r.redeemed_at).toLocaleString()}</TableCell>
                <TableCell>{r.member_name || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{r.member_email}</TableCell>
                <TableCell>{r.employee_name || "—"}</TableCell>
                <TableCell className="text-right font-medium">{r.drinks_redeemed}</TableCell>
              </TableRow>
            ))}
            {liveRows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No redemptions yet at this venue</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      {/* Detail tables */}
      <Tabs defaultValue="redemptions">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="redemptions"><BarChart3 className="h-4 w-4 mr-1" />Redemptions</TabsTrigger>
            <TabsTrigger value="members">Member visits</TabsTrigger>
            <TabsTrigger value="servers">Server activity</TabsTrigger>
            <TabsTrigger value="daily">Daily totals</TabsTrigger>
          </TabsList>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}><RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
        </div>
        <TabsContent value="redemptions" className="mt-4">
          <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Member</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead><TableHead>Server</TableHead><TableHead className="text-right">Drinks</TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">{new Date(r.redeemed_at).toLocaleString()}</TableCell>
                    <TableCell>{r.member_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.member_email}</TableCell>
                    <TableCell className="text-muted-foreground">{r.member_phone || "—"}</TableCell>
                    <TableCell>{r.employee_name || "—"}</TableCell>
                    <TableCell className="text-right font-medium">{r.drinks_redeemed}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No redemptions in this range</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="members" className="mt-4">
          <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead><TableHead className="text-right">Visits</TableHead><TableHead className="text-right">Drinks</TableHead><TableHead>Last visit</TableHead></TableRow></TableHeader>
              <TableBody>
                {memberSummary.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{m.email}</TableCell>
                    <TableCell className="text-muted-foreground">{m.phone || "—"}</TableCell>
                    <TableCell className="text-right">{m.visits}</TableCell>
                    <TableCell className="text-right font-medium">{m.drinks}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">{new Date(m.last).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {memberSummary.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No data</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="servers" className="mt-4">
          <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Server</TableHead><TableHead>Server ID</TableHead><TableHead className="text-right">Redemptions</TableHead><TableHead className="text-right">Drinks</TableHead></TableRow></TableHeader>
              <TableBody>
                {employeeSummary.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{e.name || "—"}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">{e.code}</TableCell>
                    <TableCell className="text-right">{e.redemptions}</TableCell>
                    <TableCell className="text-right font-medium">{e.drinks}</TableCell>
                  </TableRow>
                ))}
                {employeeSummary.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No data</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="daily" className="mt-4">
          <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead className="text-right">Drinks</TableHead><TableHead className="text-right">Visits</TableHead><TableHead className="text-right">Unique members</TableHead></TableRow></TableHeader>
              <TableBody>
                {dailyTotals.map((d) => (
                  <TableRow key={d.date}>
                    <TableCell>{d.date}</TableCell>
                    <TableCell className="text-right font-medium">{d.drinks}</TableCell>
                    <TableCell className="text-right">{d.visits}</TableCell>
                    <TableCell className="text-right">{d.members}</TableCell>
                  </TableRow>
                ))}
                {dailyTotals.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No data</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

type DisplaySettings = Omit<ImageDisplay, "url">;

function DisplayControls({
  url,
  display,
  onChange,
  defaultHeight,
}: {
  url: string;
  display: DisplaySettings | undefined;
  onChange: (next: DisplaySettings) => void;
  defaultHeight: number;
}) {
  const fit = display?.fit ?? "cover";
  const posX = display?.posX ?? 50;
  const posY = display?.posY ?? 50;
  const height = display?.height ?? defaultHeight;
  return (
    <div className="mt-3 grid gap-3 rounded-md border border-border/60 bg-background/40 p-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label className="text-xs">Live preview</Label>
        <div
          className="mt-1 overflow-hidden rounded-md border border-border/60 bg-card"
          style={{ height: `${Math.min(height, 220)}px` }}
        >
          {url ? (
            <img
              src={url}
              alt=""
              className="w-full h-full"
              style={{ objectFit: fit, objectPosition: `${posX}% ${posY}%` }}
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">Upload an image to preview</div>
          )}
        </div>
      </div>
      <div>
        <Label className="text-xs">Fit</Label>
        <Select value={fit} onValueChange={(v) => onChange({ ...display, fit: v as "cover" | "contain" })}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="cover">Fill frame (may crop)</SelectItem>
            <SelectItem value="contain">Show whole photo</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Height: {height}px</Label>
        <input
          type="range" min={160} max={720} step={10} value={height}
          onChange={(e) => onChange({ ...display, height: Number(e.target.value) })}
          className="mt-2 w-full"
        />
      </div>
      <div>
        <Label className="text-xs">Horizontal focus: {posX}%</Label>
        <input
          type="range" min={0} max={100} step={1} value={posX}
          onChange={(e) => onChange({ ...display, posX: Number(e.target.value) })}
          className="mt-2 w-full"
        />
      </div>
      <div>
        <Label className="text-xs">Vertical focus: {posY}%</Label>
        <input
          type="range" min={0} max={100} step={1} value={posY}
          onChange={(e) => onChange({ ...display, posY: Number(e.target.value) })}
          className="mt-2 w-full"
        />
      </div>
      <div className="sm:col-span-2 flex justify-end">
        <Button type="button" variant="outline" size="sm"
          onClick={() => onChange({ fit: "cover", posX: 50, posY: 50, height: defaultHeight })}>
          Reset view
        </Button>
      </div>
    </div>
  );
}

function ImageUploader({
  label, value, onChange,
  display, onDisplayChange, defaultHeight = 320,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  display?: DisplaySettings;
  onDisplayChange?: (next: DisplaySettings) => void;
  defaultHeight?: number;
}) {
  const [uploading, setUploading] = useState(false);
  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return toast.error("Please choose an image file");
    if (file.size > 8 * 1024 * 1024) return toast.error("Image must be under 8MB");
    setUploading(true);
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("home-images").upload(path, file, { upsert: false, contentType: file.type });
    if (error) { setUploading(false); return toast.error(error.message); }
    const { data } = supabase.storage.from("home-images").getPublicUrl(path);
    onChange(data.publicUrl);
    setUploading(false);
    toast.success("Image uploaded");
  }
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-3">
        {value ? (
          <img src={value} alt="" className="h-20 w-32 object-cover rounded-md border border-border/60" />
        ) : (
          <div className="h-20 w-32 rounded-md border border-dashed border-border/60 flex items-center justify-center text-xs text-muted-foreground">No image</div>
        )}
        <div className="flex flex-col gap-2">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ""; }}
            className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-secondary-foreground file:hover:bg-secondary/80"
            disabled={uploading}
          />
          {value && <Button type="button" variant="outline" size="sm" onClick={() => onChange("")}>Remove</Button>}
        </div>
      </div>
      {uploading && <p className="text-xs text-muted-foreground">Uploading…</p>}
      {value && onDisplayChange && (
        <DisplayControls url={value} display={display} onChange={onDisplayChange} defaultHeight={defaultHeight} />
      )}
    </div>
  );
}

function GalleryUploader({
  value, onChange,
  displays, onDisplaysChange,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  displays?: DisplaySettings[];
  onDisplaysChange?: (next: DisplaySettings[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  async function handleFiles(files: FileList) {
    setUploading(true);
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) { toast.error(`${file.name}: not an image`); continue; }
      if (file.size > 8 * 1024 * 1024) { toast.error(`${file.name}: over 8MB`); continue; }
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `gallery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("home-images").upload(path, file, { upsert: false, contentType: file.type });
      if (error) { toast.error(error.message); continue; }
      const { data } = supabase.storage.from("home-images").getPublicUrl(path);
      urls.push(data.publicUrl);
    }
    if (urls.length) {
      onChange([...value, ...urls]);
      if (onDisplaysChange) {
        const padded = [...(displays ?? [])];
        while (padded.length < value.length) padded.push({});
        for (let i = 0; i < urls.length; i++) padded.push({});
        onDisplaysChange(padded);
      }
    }
    setUploading(false);
  }
  function removeAt(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
    if (onDisplaysChange) {
      const padded = [...(displays ?? [])];
      while (padded.length < value.length) padded.push({});
      padded.splice(i, 1);
      onDisplaysChange(padded);
    }
  }
  function setDisplayAt(i: number, next: DisplaySettings) {
    if (!onDisplaysChange) return;
    const padded = [...(displays ?? [])];
    while (padded.length < value.length) padded.push({});
    padded[i] = next;
    onDisplaysChange(padded);
  }
  return (
    <div className="space-y-2">
      <Label>Gallery (between welcome and cocktails)</Label>
      <div className="flex flex-wrap gap-3">
        {value.map((url, i) => (
          <div key={i} className="relative group">
            <img src={url} alt="" className="h-20 w-28 object-cover rounded-md border border-border/60" />
            <button
              type="button"
              onClick={() => removeAt(i)}
              className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center shadow"
              aria-label="Remove image"
            >×</button>
          </div>
        ))}
        {value.length === 0 && <div className="h-20 w-28 rounded-md border border-dashed border-border/60 flex items-center justify-center text-xs text-muted-foreground">None</div>}
      </div>
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.currentTarget.value = ""; }}
        className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-secondary-foreground file:hover:bg-secondary/80"
        disabled={uploading}
      />
      {uploading && <p className="text-xs text-muted-foreground">Uploading…</p>}
      <p className="text-xs text-muted-foreground">Upload multiple at once. Drag to reorder coming later — for now, remove and re-upload to reorder.</p>
      {onDisplaysChange && value.length > 0 && (
        <div className="space-y-4 pt-2">
          {value.map((url, i) => (
            <div key={`disp-${i}`} className="rounded-md border border-border/60 p-3">
              <p className="text-xs font-medium mb-2">Photo {i + 1} view</p>
              <DisplayControls
                url={url}
                display={displays?.[i]}
                onChange={(next) => setDisplayAt(i, next)}
                defaultHeight={260}
              />
            </div>
          ))}
        </div>
      )}
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

interface ReferralCode {
  id: string;
  code: string;
  company_id: string | null;
  assigned_to_user_id: string | null;
  assigned_to_name: string | null;
  notes: string | null;
  discount_type: "fixed" | "percent" | null;
  discount_value: number | null;
  max_uses: number | null;
  expires_at: string | null;
  active: boolean;
  created_at: string;
}
interface CodeUseRow {
  id: string;
  referral_code_id: string;
  user_id: string;
  used_at: string;
  member_name: string;
  member_email: string;
}

function ReferralCodesPanel({ companyId, members }: { companyId: string; members: MemberRow[] }) {
  const [codes, setCodes] = useState<ReferralCode[]>([]);
  const [uses, setUses] = useState<CodeUseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<ReferralCode | null>(null);
  const [showUsesFor, setShowUsesFor] = useState<ReferralCode | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("referral_codes")
        .select("*")
        .or(`company_id.eq.${companyId},company_id.is.null`)
        .order("created_at", { ascending: false });
      if (error) { toast.error(error.message); return; }
      const list = (data ?? []) as ReferralCode[];
      setCodes(list);

      // Load all uses for these codes
      const ids = list.map((c) => c.id);
      if (ids.length === 0) { setUses([]); return; }
      const { data: useRows } = await supabase
        .from("referral_code_uses")
        .select("*")
        .in("referral_code_id", ids)
        .order("used_at", { ascending: false });
      const userIds = Array.from(new Set((useRows ?? []).map((u) => u.user_id)));
      const profMap = new Map<string, { full_name: string | null; email: string }>();
      if (userIds.length > 0) {
        const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", userIds);
        for (const p of profs ?? []) profMap.set(p.id, { full_name: p.full_name, email: p.email });
      }
      setUses((useRows ?? []).map((u) => {
        const p = profMap.get(u.user_id);
        return { id: u.id, referral_code_id: u.referral_code_id, user_id: u.user_id, used_at: u.used_at, member_name: p?.full_name ?? "", member_email: p?.email ?? "" };
      }));
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [companyId]);

  async function createCode(form: FormData) {
    const code = String(form.get("code") ?? "").trim();
    const discount_type_raw = String(form.get("discount_type") ?? "none");
    const tracking_only = discount_type_raw === "none";
    const discount_type = tracking_only ? null : (discount_type_raw as "fixed" | "percent");
    const valueRaw = String(form.get("discount_value") ?? "").trim();
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(code)) return toast.error("Code: 3–40 letters, numbers, dashes/underscores");
    let discount_value: number | null = null;
    if (!tracking_only) {
      const value = parseFloat(valueRaw);
      if (Number.isNaN(value) || value <= 0) return toast.error("Discount value required");
      if (discount_type === "percent" && value > 100) return toast.error("Percent must be ≤ 100");
      discount_value = discount_type === "fixed" ? Math.round(value * 100) : Math.round(value);
    }
    const assigned_to_name = String(form.get("assigned_to_name") ?? "").trim() || null;
    const assigned_to_user_id = String(form.get("assigned_to_user_id") ?? "") || null;
    const notes = String(form.get("notes") ?? "").trim() || null;
    const max_uses_raw = String(form.get("max_uses") ?? "").trim();
    const max_uses = max_uses_raw ? parseInt(max_uses_raw, 10) : null;
    const expires_at_raw = String(form.get("expires_at") ?? "").trim();
    const expires_at = expires_at_raw ? new Date(expires_at_raw + "T23:59:59").toISOString() : null;

    const { error } = await supabase.from("referral_codes").insert({
      code, company_id: companyId, assigned_to_user_id, assigned_to_name, notes,
      discount_type, discount_value, max_uses, expires_at, active: true,
    });
    if (error) {
      if (error.code === "23505") return toast.error("That code is already in use");
      return toast.error(error.message);
    }
    toast.success("Referral code created");
    load();
  }

  async function toggleActive(c: ReferralCode) {
    const { error } = await supabase.from("referral_codes").update({ active: !c.active }).eq("id", c.id);
    if (error) return toast.error(error.message);
    load();
  }
  async function deleteCode(c: ReferralCode) {
    if (!confirm(`Delete code "${c.code}"? This also removes its usage history.`)) return;
    const { error } = await supabase.from("referral_codes").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Code deleted");
    load();
  }
  async function saveEdit(patch: Partial<ReferralCode>): Promise<void> {
    if (!editing) return;
    const { error } = await supabase.from("referral_codes").update(patch).eq("id", editing.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Code updated");
    setEditing(null);
    load();
  }

  function formatDiscount(c: ReferralCode) {
    if (!c.discount_type || c.discount_value == null) return "Tracking only";
    return c.discount_type === "percent" ? `${c.discount_value}%` : `$${(c.discount_value / 100).toFixed(2)}`;
  }
  function usesCount(codeId: string) {
    return uses.filter((u) => u.referral_code_id === codeId).length;
  }
  function isExpired(c: ReferralCode) {
    return c.expires_at ? new Date(c.expires_at) < new Date() : false;
  }

  return (
    <div className="space-y-6">
      {/* Create form */}
      <form
        onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); createCode(fd); e.currentTarget.reset(); }}
        className="rounded-xl border border-border/60 bg-card p-4 space-y-3"
      >
        <div className="flex items-center gap-2">
          <Ticket className="h-5 w-5 text-primary-glow" />
          <h3 className="font-display text-lg">Create a referral code</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label htmlFor="code">Code</Label>
            <Input id="code" name="code" placeholder="SARAH10" required maxLength={40} className="uppercase tracking-widest" />
          </div>
          <div>
            <Label htmlFor="discount_type">Discount type</Label>
            <select id="discount_type" name="discount_type" defaultValue="none" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="none">None (tracking only)</option>
              <option value="percent">Percent (%)</option>
              <option value="fixed">Fixed dollars ($)</option>
            </select>
          </div>
          <div>
            <Label htmlFor="discount_value">Value (if discount)</Label>
            <Input id="discount_value" name="discount_value" type="number" min="0.01" step="0.01" placeholder="Leave blank for tracking-only" />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="assigned_to_user_id">Assigned member (optional)</Label>
            <select id="assigned_to_user_id" name="assigned_to_user_id" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">— None —</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="assigned_to_name">Or assigned name (free text)</Label>
            <Input id="assigned_to_name" name="assigned_to_name" placeholder="Bartender Sarah / @influencer" maxLength={100} />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label htmlFor="max_uses">Usage limit (optional)</Label>
            <Input id="max_uses" name="max_uses" type="number" min="1" placeholder="Unlimited" />
          </div>
          <div>
            <Label htmlFor="expires_at">Expires (optional)</Label>
            <Input id="expires_at" name="expires_at" type="date" />
          </div>
          <div>
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input id="notes" name="notes" maxLength={200} placeholder="Internal notes" />
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="submit" className="bg-gradient-primary"><Plus className="h-4 w-4 mr-1" />Create code</Button>
        </div>
      </form>

      {/* Codes table */}
      <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <h3 className="font-display text-lg">Referral codes</h3>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}><RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
        </div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Code</TableHead><TableHead>Assigned to</TableHead>
            <TableHead>Discount</TableHead><TableHead className="text-right">Uses</TableHead>
            <TableHead>Expires</TableHead><TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {codes.map((c) => {
              const used = usesCount(c.id);
              const limitText = c.max_uses ? `${used}/${c.max_uses}` : `${used}`;
              const expired = isExpired(c);
              const exhausted = c.max_uses !== null && used >= c.max_uses;
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-mono font-medium tracking-widest uppercase">{c.code}</TableCell>
                  <TableCell>
                    {c.assigned_to_user_id
                      ? (members.find((m) => m.id === c.assigned_to_user_id)?.full_name ?? members.find((m) => m.id === c.assigned_to_user_id)?.email ?? "—")
                      : (c.assigned_to_name || "—")}
                    {c.notes && <div className="text-xs text-muted-foreground mt-0.5">{c.notes}</div>}
                  </TableCell>
                  <TableCell className="font-medium">{formatDiscount(c)}</TableCell>
                  <TableCell className="text-right">
                    <button type="button" className="text-primary-glow hover:underline" onClick={() => setShowUsesFor(c)}>{limitText}</button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>
                    {!c.active && <Badge className="bg-muted text-muted-foreground">inactive</Badge>}
                    {c.active && expired && <Badge className="bg-destructive text-destructive-foreground">expired</Badge>}
                    {c.active && !expired && exhausted && <Badge className="bg-destructive text-destructive-foreground">used up</Badge>}
                    {c.active && !expired && !exhausted && <Badge className="bg-success text-success-foreground">active</Badge>}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(c)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(c)} title={c.active ? "Deactivate" : "Activate"}><Power className={`h-4 w-4 ${c.active ? "text-success" : "text-muted-foreground"}`} /></Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteCode(c)} title="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {codes.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No referral codes yet</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit referral code</DialogTitle></DialogHeader>
          {editing && (
            <ReferralEditForm code={editing} members={members} onSave={saveEdit} onCancel={() => setEditing(null)} />
          )}
        </DialogContent>
      </Dialog>

      {/* Uses dialog */}
      <Dialog open={!!showUsesFor} onOpenChange={(o) => !o && setShowUsesFor(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Members who used "{showUsesFor?.code}"</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Member</TableHead><TableHead>Email</TableHead></TableRow></TableHeader>
              <TableBody>
                {showUsesFor && uses.filter((u) => u.referral_code_id === showUsesFor.id).map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="text-muted-foreground">{new Date(u.used_at).toLocaleString()}</TableCell>
                    <TableCell>{u.member_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{u.member_email}</TableCell>
                  </TableRow>
                ))}
                {showUsesFor && uses.filter((u) => u.referral_code_id === showUsesFor.id).length === 0 && (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No uses yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReferralEditForm({ code, members, onSave, onCancel }: { code: ReferralCode; members: MemberRow[]; onSave: (patch: Partial<ReferralCode>) => void | Promise<void>; onCancel: () => void }) {
  const [draft, setDraft] = useState({
    code: code.code,
    discount_type: (code.discount_type ?? "none") as "none" | "fixed" | "percent",
    discount_value: code.discount_value == null
      ? ""
      : code.discount_type === "fixed"
        ? (code.discount_value / 100).toString()
        : code.discount_value.toString(),
    assigned_to_user_id: code.assigned_to_user_id ?? "",
    assigned_to_name: code.assigned_to_name ?? "",
    notes: code.notes ?? "",
    max_uses: code.max_uses?.toString() ?? "",
    expires_at: code.expires_at ? code.expires_at.slice(0, 10) : "",
  });

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const tracking_only = draft.discount_type === "none";
    let discount_value: number | null = null;
    if (!tracking_only) {
      const value = parseFloat(draft.discount_value);
      if (Number.isNaN(value) || value <= 0) return toast.error("Discount value required");
      if (draft.discount_type === "percent" && value > 100) return toast.error("Percent must be ≤ 100");
      discount_value = draft.discount_type === "fixed" ? Math.round(value * 100) : Math.round(value);
    }
    onSave({
      code: draft.code.trim(),
      discount_type: tracking_only ? null : (draft.discount_type as "fixed" | "percent"),
      discount_value,
      assigned_to_user_id: draft.assigned_to_user_id || null,
      assigned_to_name: draft.assigned_to_name.trim() || null,
      notes: draft.notes.trim() || null,
      max_uses: draft.max_uses ? parseInt(draft.max_uses, 10) : null,
      expires_at: draft.expires_at ? new Date(draft.expires_at + "T23:59:59").toISOString() : null,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div><Label>Code</Label><Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} required maxLength={40} className="uppercase tracking-widest" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Discount type</Label>
          <select value={draft.discount_type} onChange={(e) => setDraft({ ...draft, discount_type: e.target.value as "none" | "fixed" | "percent" })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="none">None (tracking only)</option>
            <option value="percent">Percent (%)</option>
            <option value="fixed">Fixed dollars ($)</option>
          </select>
        </div>
        <div><Label>Value</Label><Input type="number" min="0.01" step="0.01" value={draft.discount_value} onChange={(e) => setDraft({ ...draft, discount_value: e.target.value })} disabled={draft.discount_type === "none"} placeholder={draft.discount_type === "none" ? "—" : ""} /></div>
      </div>
      <div>
        <Label>Assigned member</Label>
        <select value={draft.assigned_to_user_id} onChange={(e) => setDraft({ ...draft, assigned_to_user_id: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="">— None —</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
        </select>
      </div>
      <div><Label>Or name (free text)</Label><Input value={draft.assigned_to_name} onChange={(e) => setDraft({ ...draft, assigned_to_name: e.target.value })} maxLength={100} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Usage limit</Label><Input type="number" min="1" placeholder="Unlimited" value={draft.max_uses} onChange={(e) => setDraft({ ...draft, max_uses: e.target.value })} /></div>
        <div><Label>Expires</Label><Input type="date" value={draft.expires_at} onChange={(e) => setDraft({ ...draft, expires_at: e.target.value })} /></div>
      </div>
      <div><Label>Notes</Label><Input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} maxLength={200} /></div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" className="bg-gradient-primary">Save</Button>
      </DialogFooter>
    </form>
  );
}

function HomeContentEditor() {
  const [content, setContent] = useState<HomeContent>(defaultHomeContent);
  const [jsonText, setJsonText] = useState<string>(JSON.stringify(defaultHomeContent, null, 2));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"simple" | "json">("simple");

  useEffect(() => {
    // Cast: types regenerate on first DB call once migration runs
    (supabase.from("home_content" as never).select("data").eq("id" as never, "default" as never).maybeSingle() as unknown as Promise<{ data: { data: Partial<HomeContent> } | null; error: { message: string } | null }>)
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        const merged = mergeHomeContent(data?.data ?? null);
        setContent(merged);
        setJsonText(JSON.stringify(merged, null, 2));
        setLoading(false);
      });
  }, []);

  function updateField<K extends keyof HomeContent>(key: K, value: HomeContent[K]) {
    setContent((c) => {
      const next = { ...c, [key]: value };
      setJsonText(JSON.stringify(next, null, 2));
      return next;
    });
  }

  async function save(payload: HomeContent) {
    setSaving(true);
    const { error } = await (supabase.from("home_content" as never) as unknown as {
      upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => Promise<{ error: { message: string } | null }>;
    }).upsert({ id: "default", data: payload, updated_at: new Date().toISOString() }, { onConflict: "id" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Member home page updated");
    setContent(payload);
    setJsonText(JSON.stringify(payload, null, 2));
  }

  function saveSimple() { save(content); }
  function saveJson() {
    try {
      const parsed = JSON.parse(jsonText);
      const merged = mergeHomeContent(parsed);
      save(merged);
    } catch (e) {
      toast.error("Invalid JSON: " + (e as Error).message);
    }
  }
  function reset() {
    if (!confirm("Reset member home page to defaults?")) return;
    save(defaultHomeContent);
  }

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-2xl">Member home page</h2>
          <p className="text-sm text-muted-foreground">Edit the welcome copy, cocktail lists, and closing CTA shown to signed-in members on the home page.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={reset}>Reset to defaults</Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="simple">Simple editor</TabsTrigger>
          <TabsTrigger value="json">Advanced (JSON)</TabsTrigger>
        </TabsList>

        <TabsContent value="simple" className="mt-4 space-y-6">
          <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
            <h3 className="font-medium">Welcome message</h3>
            <div>
              <Label>Heading</Label>
              <Input value={content.welcomeHeading} onChange={(e) => updateField("welcomeHeading", e.target.value)} />
            </div>
            <div>
              <Label>Body paragraphs (one per line, blank line to separate)</Label>
              <Textarea
                rows={10}
                value={content.welcomeParagraphs.join("\n\n")}
                onChange={(e) => updateField("welcomeParagraphs", e.target.value.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean))}
              />
            </div>
            <div>
              <Label>Sign-off</Label>
              <Textarea rows={2} value={content.welcomeSignoff} onChange={(e) => updateField("welcomeSignoff", e.target.value)} />
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
            <h3 className="font-medium">Cocktails section</h3>
            <div>
              <Label>Intro line under "Cocktails"</Label>
              <Input value={content.cocktailsIntro} onChange={(e) => updateField("cocktailsIntro", e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">To add or remove cocktails and sections, use the Advanced (JSON) tab.</p>
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
            <h3 className="font-medium">Closing CTA</h3>
            <div>
              <Label>Heading</Label>
              <Input value={content.closingHeading} onChange={(e) => updateField("closingHeading", e.target.value)} />
            </div>
            <div>
              <Label>Body</Label>
              <Textarea rows={3} value={content.closingBody} onChange={(e) => updateField("closingBody", e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>External link button label</Label>
                <Input
                  placeholder="e.g. Visit our website"
                  value={content.closingLinkLabel ?? ""}
                  onChange={(e) => updateField("closingLinkLabel", e.target.value)}
                />
              </div>
              <div>
                <Label>External link URL</Label>
                <Input
                  type="url"
                  placeholder="https://example.com"
                  value={content.closingLinkUrl ?? ""}
                  onChange={(e) => updateField("closingLinkUrl", e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Both label and URL are required for the button to appear. Opens in a new tab.</p>
            <ImageUploader
              label="Closing image (above 'Pull up a stool')"
              value={content.closingImageUrl ?? ""}
              onChange={(url) => updateField("closingImageUrl", url)}
              display={content.closingDisplay}
              onDisplayChange={(next) => updateField("closingDisplay", next)}
              defaultHeight={320}
            />
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
            <h3 className="font-medium">Pictures</h3>
            <ImageUploader
              label="Hero background image"
              value={content.heroImageUrl ?? ""}
              onChange={(url) => updateField("heroImageUrl", url)}
              display={content.heroDisplay}
              onDisplayChange={(next) => updateField("heroDisplay", next)}
              defaultHeight={520}
            />
            <GalleryUploader
              value={content.galleryImages ?? []}
              onChange={(urls) => updateField("galleryImages", urls)}
              displays={content.galleryDisplays}
              onDisplaysChange={(next) => updateField("galleryDisplays", next)}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={saveSimple} disabled={saving} className="bg-gradient-primary shadow-glow">{saving ? "Saving…" : "Save changes"}</Button>
          </div>
        </TabsContent>

        <TabsContent value="json" className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">Edit the full home content as JSON. Useful for adding/removing cocktail sections and items.</p>
          <Textarea rows={28} value={jsonText} onChange={(e) => setJsonText(e.target.value)} className="font-mono text-xs" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setJsonText(JSON.stringify(content, null, 2))}>Revert</Button>
            <Button onClick={saveJson} disabled={saving} className="bg-gradient-primary shadow-glow">{saving ? "Saving…" : "Save JSON"}</Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
