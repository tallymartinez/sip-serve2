import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GlassWater, Store, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/manager")({
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/login" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .in("role", ["manager", "admin", "super_admin"]);
    if (!roles || roles.length === 0) throw redirect({ to: "/dashboard" });
  },
  component: ManagerPage,
});

type Range = "day" | "week" | "month";

function rangeStart(r: Range): string {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (r === "week") d.setDate(d.getDate() - 6);
  if (r === "month") d.setDate(d.getDate() - 29);
  return d.toISOString().slice(0, 10);
}

interface Venue { id: string; name: string; address: string | null; }
interface LogRow {
  id: string; redeemed_at: string; drinks_redeemed: number;
  user_id: string; venue_id: string | null; employee_id: string | null;
  member_name: string; member_email: string; venue_name: string; employee_name: string;
}
interface MemberStat { user_id: string; full_name: string; email: string; visits: number; drinks: number; last: string; }

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
      // RLS scopes this to assigned venues only
      const { data: assigned } = await supabase.from("manager_venues").select("venue_id").eq("user_id", user.id);
      const ids = (assigned ?? []).map((a) => a.venue_id);
      if (ids.length === 0) { setVenues([]); return; }
      const { data: vs } = await supabase.from("venues").select("id,name,address").in("id", ids).order("name");
      setVenues((vs ?? []) as Venue[]);
    })();
  }, [user]);

  useEffect(() => {
    if (!user || venues.length === 0) { setLogs([]); setMemberStats([]); return; }
    (async () => {
      const venueIds = venueFilter === "all" ? venues.map((v) => v.id) : [venueFilter];
      const venueNameMap = new Map(venues.map((v) => [v.id, v.name]));
      const { data: rs } = await supabase
        .from("redemptions")
        .select("id,user_id,employee_id,venue_id,drinks_redeemed,redeemed_at")
        .in("venue_id", venueIds)
        .gte("redeemed_date", since)
        .order("redeemed_at", { ascending: false });
      const redemps = rs ?? [];

      const userIds = Array.from(new Set(redemps.map((r) => r.user_id)));
      const empIds = Array.from(new Set(redemps.map((r) => r.employee_id).filter(Boolean) as string[]));
      const [{ data: profs }, { data: emps }] = await Promise.all([
        userIds.length ? supabase.from("profiles").select("id,full_name,email").in("id", userIds) : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string }[] }),
        empIds.length ? supabase.from("employees").select("id,full_name").in("id", empIds) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      ]);
      const profMap = new Map((profs ?? []).map((p) => [p.id, p]));
      const empMap = new Map((emps ?? []).map((e) => [e.id, e.full_name]));

      setLogs(redemps.map((r) => {
        const m = profMap.get(r.user_id);
        return {
          id: r.id, redeemed_at: r.redeemed_at, drinks_redeemed: r.drinks_redeemed,
          user_id: r.user_id, venue_id: r.venue_id, employee_id: r.employee_id,
          member_name: m?.full_name ?? "", member_email: m?.email ?? "",
          venue_name: r.venue_id ? (venueNameMap.get(r.venue_id) ?? "—") : "—",
          employee_name: r.employee_id ? (empMap.get(r.employee_id) ?? "—") : "—",
        };
      }));

      // Aggregate per-member
      const agg = new Map<string, MemberStat>();
      for (const r of redemps) {
        const cur = agg.get(r.user_id);
        const p = profMap.get(r.user_id);
        if (cur) {
          cur.visits += 1;
          cur.drinks += r.drinks_redeemed;
          if (r.redeemed_at > cur.last) cur.last = r.redeemed_at;
        } else {
          agg.set(r.user_id, {
            user_id: r.user_id,
            full_name: p?.full_name ?? "",
            email: p?.email ?? "",
            visits: 1,
            drinks: r.drinks_redeemed,
            last: r.redeemed_at,
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
          Your manager account isn't linked to any venue yet. Ask the program owner to assign you.
        </p>
      </main>
    );
  }

  const totalDrinks = logs.reduce((s, l) => s + l.drinks_redeemed, 0);
  const uniqueMembers = new Set(logs.map((l) => l.user_id)).size;

  return (
    <main className="container mx-auto max-w-6xl px-3 sm:px-4 py-8 sm:py-10">
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
          <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
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
          <p className="mt-2 font-display text-3xl text-gradient flex items-center gap-2">
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
          <TabsTrigger value="logs"><BarChart3 className="h-4 w-4 mr-1" />Redemption log</TabsTrigger>
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
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-muted-foreground">{new Date(l.redeemed_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="font-medium">{l.member_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{l.member_email}</div>
                    </TableCell>
                    <TableCell>{l.venue_name}</TableCell>
                    <TableCell>{l.employee_name}</TableCell>
                    <TableCell className="text-right font-medium">{l.drinks_redeemed}</TableCell>
                  </TableRow>
                ))}
                {logs.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10">No redemptions in this period</TableCell></TableRow>
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
                {memberStats.map((m) => (
                  <TableRow key={m.user_id}>
                    <TableCell className="font-medium">{m.full_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{m.email}</TableCell>
                    <TableCell className="text-right">{m.visits}</TableCell>
                    <TableCell className="text-right">{m.drinks}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(m.last).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {memberStats.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10">No members in this period</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
