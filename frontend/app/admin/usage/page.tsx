"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAdminUsage } from "@/lib/api";

export default function AdminUsagePage() {
  const [view, setView] = React.useState<"paid" | "trial">("paid");
  const [searchInput, setSearchInput] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const usageQuery = useQuery({
    queryKey: ["admin-usage", view, debouncedSearch, page],
    queryFn: () =>
      getAdminUsage({
        view,
        search: debouncedSearch || undefined,
        page,
      }),
    staleTime: 0,
  });

  const items = usageQuery.data?.items || [];
  const total = usageQuery.data?.total ?? 0;
  const totalPages = usageQuery.data?.total_pages || 1;
  const sourcesNote = usageQuery.data?.sources_note;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
        <p className="text-sm text-muted-foreground">
          Current quota-window generation activity, token consumption, real LLM/search cost, and daily spend caps.
        </p>
      </div>

      <Tabs
        value={view}
        onValueChange={(v) => {
          setView(v as "paid" | "trial");
          setPage(1);
        }}
      >
        <TabsList>
          <TabsTrigger value="paid">Paid</TabsTrigger>
          <TabsTrigger value="trial">Trial or unpaid</TabsTrigger>
        </TabsList>

        <TabsContent value={view} className="mt-4 space-y-4">
          <Card className="border-border bg-card">
            <CardContent className="pt-6">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search name or email..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-9"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {view === "paid" ? "Paid user usage" : "Trial and unpaid user usage"}
              </CardTitle>
              <CardDescription>{total} user{total === 1 ? "" : "s"} in this view</CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Plan</TableHead>
                    {view === "trial" && <TableHead>Trial days left</TableHead>}
                    <TableHead>Generated / Pub / Failed</TableHead>
                    <TableHead>Tokens (in / out)</TableHead>
                    <TableHead>Window cost</TableHead>
                    <TableHead className="min-w-[150px]">Quota used</TableHead>
                    <TableHead>Today spend / limit</TableHead>
                    <TableHead>Playground today</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usageQuery.isLoading ? (
                    <TableRow>
                      <TableCell
                        colSpan={view === "trial" ? 9 : 8}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        <Loader2 className="inline size-4 animate-spin mr-2" />
                        Loading usage...
                      </TableCell>
                    </TableRow>
                  ) : items.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={view === "trial" ? 9 : 8}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        No users found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>
                          <Link href={`/admin/users/${u.id}`} className="font-medium text-sm hover:underline">
                            {u.name}
                          </Link>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium">{u.plan_name}</span>
                            <Badge variant="outline" className="text-xs">{u.effective_status}</Badge>
                          </div>
                        </TableCell>
                        {view === "trial" && (
                          <TableCell className="text-xs tabular-nums">
                            {u.trial_days_left !== null ? `${u.trial_days_left}d` : "-"}
                          </TableCell>
                        )}
                        <TableCell className="text-xs tabular-nums whitespace-nowrap">
                          {u.posts_generated} / {u.posts_published} /{" "}
                          <span className={u.failed_runs > 0 ? "text-destructive font-medium" : ""}>
                            {u.failed_runs}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs tabular-nums whitespace-nowrap">
                          {u.tokens_in.toLocaleString()} / {u.tokens_out.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs font-mono tabular-nums whitespace-nowrap">
                          ${u.cost_usd.toFixed(4)}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>
                                {u.quota_used}
                                {u.quota_limit !== null ? ` / ${u.quota_limit}` : " (unlimited)"}
                              </span>
                              {u.quota_limit !== null && <span>{u.quota_percent}%</span>}
                            </div>
                            {u.quota_limit !== null && (
                              <Progress value={u.quota_percent} className="h-1.5" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-mono tabular-nums whitespace-nowrap">
                          ${u.today_spend_usd.toFixed(4)}
                          {u.daily_spend_limit_usd !== null
                            ? ` / $${u.daily_spend_limit_usd.toFixed(2)}`
                            : " / -"}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums whitespace-nowrap">
                          {u.playground_today_used}
                          {u.playground_daily_limit !== null ? ` / ${u.playground_daily_limit}` : ""}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>

          {sourcesNote && (
            <Card className="border-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Data Sources</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-1.5 text-xs text-muted-foreground md:grid-cols-2">
                {Object.entries(sourcesNote).map(([k, desc]) => (
                  <div key={k}>
                    <span className="font-mono text-foreground">{k}:</span> {desc}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
