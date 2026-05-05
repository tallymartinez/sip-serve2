import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DEMO_MANAGER_LOGS, DEMO_VENUES, isDemoMode } from "@/lib/demo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GlassWater, Store, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/manager")({
  beforeLoad: async () => {
    if (isDemoMode) return;
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/login" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .in("role", ["manager", "admin", "super_admin"]);
    if (!roles || roles.length === 0) throw redirect({ to: "/dashboard" });
  },
  component: ManagerRoute,
});

function ManagerRoute() {
  return isDemoMode ? <DemoManagerPage /> : <ManagerPage />;
}

type Range = "day" | "week" | "month";

function rangeStart(r: Range): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (r === "week") d.setDate(d.getDate() - 6);
  if (r === "month") d.setDate(d.getDate() - 29);
  return d.toISOString().slice(0, 10);
}

interface Venue {
  id: string;
  name: string;
  address: string | null;
}

interface LogRow {
  id: string;
  redeemed_at: string;
  drinks_redeemed: number;
  user_id: string;
  venue_id: string | null;
  user_role_id: string | null;
  employee_id: string | null;
  member_name: string;
  member_email: string;
  venue_name: string;
  server_name: string;
}

interface MemberStat {
  user_id: string;
  full_name: string;
  email: string;
  visits: number;
  drinks: number;
  last: string;
}

function ManagerPage() {
  const { user, loading } = useAuth();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueFilter, setVenueFilter] = useState<string>("all");
  const [range, setRange] = useState<Range>("day");
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [memberStats, setMemberStats] = useState<MemberStat[]>([]);

  const since = useMemo(() => rangeStart(range), [range]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: assigned } = await supabase
        .from("user_roles")
        .select("venue_id")
        .eq("user_id", user.id)
        .eq("role", "manager")
        .eq("active", true)
        .not("venue_id", "is", null);

      const ids = Array.from(new Set((assigned ?? []).map((row) => row.venue_id).filter(Boolean) as string[]));
      if (ids.length === 0) {
        setVenues([]);
        return;
      }

      const { data: vs } = await supabase.from("venues").select("id,name,address").in("id", ids).order("name");
      setVenues((vs ?? []) as Venue[]);
    })();
  }, [user]);

  useEffect(() => {
    if (!user || venues.length === 0) {
      setLogs([]);
      setMemberStats([]);
      return;
    }

    (async () => {
      const venueIds = venueFilter === "all" ? venues.map((v) => v.id) : [venueFilter];
      const venueNameMap = new Map(venues.map((v) => [v.id, v.name]));

      const { data: rs } = await supabase
        .from("redemptions")
        .select("id,user_id,user_role_id,employee_id,venue_id,drinks_redeemed,redeemed_at")
        .in("venue_id", venueIds)
        .gte("redeemed_date", since)
        .order("redeemed_at", { ascending: false });

      const redemps = rs ?? [];
      const userIds = Array.from(new Set(redemps.map((r) => r.user_id)));
      const roleIds = Array.from(new Set(redemps.map((r) => r.user_role_id).filter(Boolean) as string[]));
      const employeeIds = Array.from(new Set(redemps.map((r) => r.employee_id).filter(Boolean) as string[]));

      const [{ data: profs }, { data: roleRows }, { data: employees }] = await Promise.all([
        userIds.length
          ? supabase.from("profiles").select("id,full_name,email").in("id", userIds)
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

      const profMap = new Map((profs ?? []).map((p) => [p.id, p]));
      const roleMap = new Map((roleRows ?? []).map((r) => [r.id, r]));
      const serverProfileMap = new Map((serverProfiles ?? []).map((p) => [p.id, p]));
      const employeeMap = new Map((employees ?? []).map((e) => [e.id, e.full_name]));

      setLogs(
        redemps.map((r) => {
          const member = profMap.get(r.user_id);
          const serverRole = r.user_role_id ? roleMap.get(r.user_role_id) : null;
          const serverProfile = serverRole ? serverProfileMap.get(serverRole.user_id) : null;

          return {
            id: r.id,
            redeemed_at: r.redeemed_at,
            drinks_redeemed: r.drinks_redeemed,
            user_id: r.user_id,
            venue_id: r.venue_id,
            user_role_id: r.user_role_id ?? null,
            employee_id: r.employee_id,
            member_name: member?.full_name ?? "",
            member_email: member?.email ?? "",
            venue_name: r.venue_id ? (venueNameMap.get(r.venue_id) ?? "—") : "—",
            server_name:
              serverProfile?.full_name
              ?? (serverRole?.server_code ? `Server ${serverRole.server_code}` : null)
              ?? (r.employee_id ? (employeeMap.get(r.employee_id) ?? "—") : "—"),
          };
        }),
      );

      const agg = new Map<string, MemberStat>();
      for (const redemption of redemps) {
        const current = agg.get(redemption.user_id);
        const profile = profMap.get(redemption.user_id);
        if (current) {
          current.visits += 1;
          current.drinks += redemption.drinks_redeemed;
          if (redemption.redeemed_at > current.last) current.last = redemption.redeemed_at;
        } else {
          agg.set(redemption.user_id, {
            user_id: redemption.user_id,
            full_name: profile?.full_name ?? "",
            email: profile?.email ?? "",
            visits: 1,
            drinks: redemption.drinks_redeemed,
            last: redemption.redeemed_at,
          });
        }
      }
      setMemberStats(Array.from(agg.values()).sort((a, b) => b.drinks - a.drinks));
    })();
  }, [user, venues, venueFilter, since]);

  if (loading) return <main className="container mx-auto px-4 py-16">Loading…</main>;

  if (venues.length === 0) {
    return (
      <main className="container mx-auto max-w-2xl px-4 py-16 text-center">
        <Store className="mx-auto h-10 w-10 text-primary-glow" />
        <h1 className="mt-3 font-display text-2xl">No venues assigned</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your manager account isn&apos;t linked to any venue yet. Ask the program owner to assign you.
        </p>
      </main>
    );
  }

  const totalDrinks = logs.reduce((sum, log) => sum + log.drinks_redeemed, 0);
  const uniqueMembers = new Set(logs.map((log) => log.user_id)).size;

  return (
    <main className="container mx-auto max-w-6xl px-3 py-8 sm:px-4 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl">Manager dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Read-only view of redemption activity for your venues.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={venueFilter} onValueChange={setVenueFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All my venues</SelectItem>
              {venues.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Tabs value={range} onValueChange={(value) => setRange(value as Range)}>
            <TabsList>
              <TabsTrigger value="day">Today</TabsTrigger>
              <TabsTrigger value="week">7 days</TabsTrigger>
              <TabsTrigger value="month">30 days</TabsTrigger>
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

      <Tabs defaultValue="logs" className="mt-8">
        <TabsList>
          <TabsTrigger value="logs"><BarChart3 className="mr-1 h-4 w-4" />Redemption log</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="mt-4">
          <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Venue</TableHead>
                  <TableHead>Server</TableHead>
                  <TableHead className="text-right">Drinks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-muted-foreground">{new Date(log.redeemed_at).toLocaleString()}</TableCell>
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
                  <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No redemptions in this period</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="members" className="mt-4">
          <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Visits</TableHead>
                  <TableHead className="text-right">Drinks</TableHead>
                  <TableHead>Last visit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {memberStats.map((member) => (
                  <TableRow key={member.user_id}>
                    <TableCell className="font-medium">{member.full_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{member.email}</TableCell>
                    <TableCell className="text-right">{member.visits}</TableCell>
                    <TableCell className="text-right">{member.drinks}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(member.last).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {memberStats.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No members in this period</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}

function DemoManagerPage() {
  const totalDrinks = DEMO_MANAGER_LOGS.reduce((sum, row) => sum + row.drinks_redeemed, 0);
  const uniqueMembers = new Set(DEMO_MANAGER_LOGS.map((row) => row.user_id)).size;

  return (
    <main className="container mx-auto max-w-6xl px-3 py-8 sm:px-4 sm:py-10">
      <div className="mb-4 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
        Demo mode is active. This manager dashboard is showing local sample venues and redemption activity.
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl">Manager dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Read-only view of redemption activity for your venues.</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Redemptions</p>
          <p className="mt-2 font-display text-3xl">{DEMO_MANAGER_LOGS.length}</p>
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

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Member</TableHead>
                <TableHead>Venue</TableHead>
                <TableHead>Server</TableHead>
                <TableHead className="text-right">Drinks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DEMO_MANAGER_LOGS.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-muted-foreground">{new Date(row.redeemed_at).toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="font-medium">{row.member_name}</div>
                    <div className="text-xs text-muted-foreground">{row.member_email}</div>
                  </TableCell>
                  <TableCell>{row.venue_name}</TableCell>
                  <TableCell>{row.employee_name}</TableCell>
                  <TableCell className="text-right font-medium">{row.drinks_redeemed}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Assigned venues</p>
          <div className="mt-4 space-y-3">
            {DEMO_VENUES.map((venue) => (
              <div key={venue.id} className="rounded-lg border border-border/60 bg-background/40 p-4">
                <div className="font-medium">{venue.name}</div>
                <div className="text-sm text-muted-foreground">{venue.address}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
