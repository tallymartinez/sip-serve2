import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DEMO_MANAGER_LOGS, DEMO_VENUES, isDemoMode } from "@/lib/demo";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BarChart3, GlassWater, Store } from "lucide-react";

export const Route = createFileRoute("/staff")({
  beforeLoad: async () => {
    if (isDemoMode) return;
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: StaffRoute,
});

type Range = "hour" | "day" | "three_days" | "week" | "month";

interface StaffVenue {
  id: string;
  name: string;
  address: string | null;
}

interface StaffLogRow {
  id: string;
  redeemed_at: string;
  drinks_redeemed: number;
  drink_name: string | null;
  user_id: string;
  venue_id: string | null;
  user_role_id: string | null;
  employee_id: string | null;
  member_name: string;
  member_email: string;
  venue_name: string;
  server_name: string;
}

function StaffRoute() {
  return isDemoMode ? <DemoStaff /> : <Staff />;
}

function rangeStart(range: Range) {
  const now = new Date();
  const from = new Date(now);
  if (range === "hour") from.setHours(from.getHours() - 1);
  if (range === "day") from.setDate(from.getDate() - 1);
  if (range === "three_days") from.setDate(from.getDate() - 3);
  if (range === "week") from.setDate(from.getDate() - 7);
  if (range === "month") from.setDate(from.getDate() - 30);
  return from.toISOString();
}

function Staff() {
  const { user, roles, loading } = useAuth();
  const [assignedVenues, setAssignedVenues] = useState<StaffVenue[]>([]);
  const [serverRoleIds, setServerRoleIds] = useState<string[]>([]);
  const [venueFilter, setVenueFilter] = useState<string>("all");
  const [range, setRange] = useState<Range>("day");
  const [logs, setLogs] = useState<StaffLogRow[]>([]);

  const canManageLogs = roles.includes("manager") || roles.includes("admin") || roles.includes("super_admin");
  const canView = canManageLogs || roles.includes("server");
  const since = useMemo(() => rangeStart(range), [range]);

  useEffect(() => {
    if (!user || !canView) return;

    (async () => {
      const { data: assignments } = await supabase
        .from("user_roles")
        .select("id,role,venue_id,active")
        .eq("user_id", user.id)
        .eq("active", true)
        .in("role", ["manager", "server"])
        .not("venue_id", "is", null);

      const nextServerRoleIds = (assignments ?? [])
        .filter((row) => row.role === "server" && row.venue_id)
        .map((row) => row.id);
      const venueIds = Array.from(new Set((assignments ?? []).map((row) => row.venue_id).filter(Boolean) as string[]));

      setServerRoleIds(nextServerRoleIds);

      if (venueIds.length === 0) {
        setAssignedVenues([]);
        return;
      }

      const { data: venues } = await supabase.from("venues").select("id,name,address").in("id", venueIds).order("name");
      setAssignedVenues((venues ?? []) as StaffVenue[]);
    })();
  }, [canView, user]);

  useEffect(() => {
    if (!user || !canView) return;
    if (assignedVenues.length === 0 && serverRoleIds.length === 0) {
      setLogs([]);
      return;
    }

    (async () => {
      const venueIds = venueFilter === "all" ? assignedVenues.map((venue) => venue.id) : [venueFilter];
      const venueNameMap = new Map(assignedVenues.map((venue) => [venue.id, venue.name]));

      let query = supabase
        .from("redemptions")
        .select("id,user_id,user_role_id,employee_id,venue_id,drinks_redeemed,redeemed_at,drink_name")
        .gte("redeemed_at", since)
        .order("redeemed_at", { ascending: false });

      if (canManageLogs) {
        if (venueIds.length === 0) {
          setLogs([]);
          return;
        }
        query = query.in("venue_id", venueIds);
      } else {
        if (serverRoleIds.length === 0) {
          setLogs([]);
          return;
        }
        query = query.in("user_role_id", serverRoleIds);
        if (venueFilter !== "all") query = query.eq("venue_id", venueFilter);
      }

      const { data: redemptions } = await query;
      const rows = redemptions ?? [];

      const memberIds = Array.from(new Set(rows.map((row) => row.user_id)));
      const roleIds = Array.from(new Set(rows.map((row) => row.user_role_id).filter(Boolean) as string[]));
      const employeeIds = Array.from(new Set(rows.map((row) => row.employee_id).filter(Boolean) as string[]));

      const [{ data: memberProfiles }, { data: roleRows }, { data: legacyEmployees }] = await Promise.all([
        memberIds.length
          ? supabase.from("profiles").select("id,full_name,email").in("id", memberIds)
          : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string }[] }),
        roleIds.length
          ? supabase.from("user_roles").select("id,user_id,server_code").in("id", roleIds)
          : Promise.resolve({ data: [] as { id: string; user_id: string; server_code: string | null }[] }),
        employeeIds.length
          ? supabase.from("employees").select("id,full_name").in("id", employeeIds)
          : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      ]);

      const serverUserIds = Array.from(new Set((roleRows ?? []).map((row) => row.user_id)));
      const { data: serverProfiles } = await (
        serverUserIds.length
          ? supabase.from("profiles").select("id,full_name").in("id", serverUserIds)
          : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] })
      );

      const memberMap = new Map((memberProfiles ?? []).map((profile) => [profile.id, profile]));
      const roleMap = new Map((roleRows ?? []).map((row) => [row.id, row]));
      const serverProfileMap = new Map((serverProfiles ?? []).map((profile) => [profile.id, profile]));
      const employeeMap = new Map((legacyEmployees ?? []).map((employee) => [employee.id, employee.full_name]));

      setLogs(
        rows.map((row) => {
          const member = memberMap.get(row.user_id);
          const serverRole = row.user_role_id ? roleMap.get(row.user_role_id) : null;
          const serverProfile = serverRole ? serverProfileMap.get(serverRole.user_id) : null;

          return {
            id: row.id,
            redeemed_at: row.redeemed_at,
            drinks_redeemed: row.drinks_redeemed,
            drink_name: row.drink_name ?? null,
            user_id: row.user_id,
            venue_id: row.venue_id,
            user_role_id: row.user_role_id ?? null,
            employee_id: row.employee_id ?? null,
            member_name: member?.full_name ?? "",
            member_email: member?.email ?? "",
            venue_name: row.venue_id ? (venueNameMap.get(row.venue_id) ?? "—") : "—",
            server_name:
              serverProfile?.full_name
              ?? (serverRole?.server_code ? `Server ${serverRole.server_code}` : null)
              ?? (row.employee_id ? (employeeMap.get(row.employee_id) ?? "—") : "—"),
          };
        }),
      );
    })();
  }, [assignedVenues, canManageLogs, canView, since, serverRoleIds, user, venueFilter]);

  if (loading) return <main className="container mx-auto px-4 py-16">Loading…</main>;
  if (!canView) return <main className="container mx-auto px-4 py-16">Staff only.</main>;

  if (assignedVenues.length === 0 && serverRoleIds.length === 0) {
    return (
      <main className="container mx-auto max-w-2xl px-4 py-16 text-center">
        <Store className="mx-auto h-10 w-10 text-primary-glow" />
        <h1 className="mt-3 font-display text-2xl">No staff assignments yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This account is not linked to any venue or server assignment yet.
        </p>
      </main>
    );
  }

  const totalDrinks = logs.reduce((sum, row) => sum + row.drinks_redeemed, 0);
  const uniqueMembers = new Set(logs.map((row) => row.user_id)).size;

  return (
    <main className="container mx-auto max-w-6xl px-3 py-8 sm:px-4 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl">Staff activity</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {canManageLogs
              ? "Read-only redemption activity for your assigned venues."
              : "Read-only redemption activity for your server assignments."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {assignedVenues.length > 1 && (
            <Select value={venueFilter} onValueChange={setVenueFilter}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All assigned venues</SelectItem>
                {assignedVenues.map((venue) => <SelectItem key={venue.id} value={venue.id}>{venue.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Tabs value={range} onValueChange={(value) => setRange(value as Range)}>
            <TabsList>
              <TabsTrigger value="hour">Last hour</TabsTrigger>
              <TabsTrigger value="day">Day</TabsTrigger>
              <TabsTrigger value="three_days">3 days</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Redemptions</p>
          <p className="mt-2 font-display text-3xl">{logs.length}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Drinks served</p>
          <p className="mt-2 flex items-center gap-2 font-display text-3xl text-gradient">
            <GlassWater className="h-7 w-7 text-primary-glow" />{totalDrinks}
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Unique members</p>
          <p className="mt-2 font-display text-3xl">{uniqueMembers}</p>
        </div>
      </div>

      <div className="mt-8 rounded-xl border border-border/60 bg-card overflow-x-auto">
        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
          <BarChart3 className="h-4 w-4 text-primary-glow" />
          <h2 className="font-display text-lg">Redeemed drinks</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Drink</TableHead>
              <TableHead>Member</TableHead>
              <TableHead>Venue</TableHead>
              <TableHead>Server</TableHead>
              <TableHead className="text-right">Qty</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="text-muted-foreground whitespace-nowrap">{new Date(log.redeemed_at).toLocaleString()}</TableCell>
                <TableCell>
                  {log.drink_name ? (
                    <Badge variant="outline">{log.drink_name}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="font-medium">{log.member_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{log.member_email}</div>
                </TableCell>
                <TableCell>{log.venue_name}</TableCell>
                <TableCell>{log.server_name}</TableCell>
                <TableCell className="text-right font-medium">{log.drinks_redeemed}</TableCell>
              </TableRow>
            ))}
            {logs.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No redeemed drinks in this period.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}

function DemoStaff() {
  const [venueFilter, setVenueFilter] = useState<string>("all");
  const [range, setRange] = useState<Range>("day");

  const filteredLogs = useMemo(() => {
    const since = rangeStart(range);
    return DEMO_MANAGER_LOGS.filter((row) => {
      if (new Date(row.redeemed_at).toISOString() < since) return false;
      if (venueFilter !== "all" && row.venue_id !== venueFilter) return false;
      return true;
    });
  }, [range, venueFilter]);

  const totalDrinks = filteredLogs.reduce((sum, row) => sum + row.drinks_redeemed, 0);
  const uniqueMembers = new Set(filteredLogs.map((row) => row.user_id)).size;

  return (
    <main className="container mx-auto max-w-6xl px-3 py-8 sm:px-4 sm:py-10">
      <div className="mb-4 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
        Demo mode is active. This staff page is showing local sample redemption activity.
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl">Staff activity</h1>
          <p className="mt-1 text-sm text-muted-foreground">Read-only redemption activity for demo staff and managers.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={venueFilter} onValueChange={setVenueFilter}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All demo venues</SelectItem>
              {DEMO_VENUES.map((venue) => <SelectItem key={venue.id} value={venue.id}>{venue.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Tabs value={range} onValueChange={(value) => setRange(value as Range)}>
            <TabsList>
              <TabsTrigger value="hour">Last hour</TabsTrigger>
              <TabsTrigger value="day">Day</TabsTrigger>
              <TabsTrigger value="three_days">3 days</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Redemptions</p>
          <p className="mt-2 font-display text-3xl">{filteredLogs.length}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Drinks served</p>
          <p className="mt-2 flex items-center gap-2 font-display text-3xl text-gradient">
            <GlassWater className="h-7 w-7 text-primary-glow" />{totalDrinks}
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Unique members</p>
          <p className="mt-2 font-display text-3xl">{uniqueMembers}</p>
        </div>
      </div>

      <div className="mt-8 rounded-xl border border-border/60 bg-card overflow-x-auto">
        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
          <BarChart3 className="h-4 w-4 text-primary-glow" />
          <h2 className="font-display text-lg">Redeemed drinks</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Drink</TableHead>
              <TableHead>Member</TableHead>
              <TableHead>Venue</TableHead>
              <TableHead>Server</TableHead>
              <TableHead className="text-right">Qty</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLogs.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="text-muted-foreground whitespace-nowrap">{new Date(row.redeemed_at).toLocaleString()}</TableCell>
                <TableCell><span className="text-muted-foreground">Demo drink</span></TableCell>
                <TableCell>
                  <div className="font-medium">{row.member_name}</div>
                  <div className="text-xs text-muted-foreground">{row.member_email}</div>
                </TableCell>
                <TableCell>{row.venue_name}</TableCell>
                <TableCell>{row.employee_name}</TableCell>
                <TableCell className="text-right font-medium">{row.drinks_redeemed}</TableCell>
              </TableRow>
            ))}
            {filteredLogs.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No redeemed drinks in this period.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
