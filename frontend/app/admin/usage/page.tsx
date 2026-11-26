"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";

import { AdminExportButton } from "@/components/admin/export-button";
import {
  DataTableShell,
  DaysLeftChip,
  EmptyState,
  ErrorState,
  PageHeader,
  PaginationFooter,
  PlanBadge,
  StatusBadge,
  TableSkeleton,
  Toolbar,
  UsageBar,
  UserAvatar,
} from "@/components/admin/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <PageHeader
        title="Usage"
        description="Current quota-window generation activity, token consumption, real LLM/search cost, and daily spend caps."
        actions={
          <AdminExportButton
            kind="usage"
            params={{
              view,
              search: debouncedSearch || undefined,
            }}
          />
        }
      />

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
          {usageQuery.isError ? (
            <ErrorState
              title="Could not load usage"
              message="Failed to fetch usage statistics."
              onRetry={() => usageQuery.refetch()}
            />
          ) : (
            <DataTableShell
              title={view === "paid" ? "Paid user usage" : "Trial and unpaid user usage"}
              description={`${total} user${total === 1 ? "" : "s"} in this view`}
              toolbar={
                <Toolbar
                  searchValue={searchInput}
                  onSearchChange={setSearchInput}
                  searchPlaceholder="Search name or email..."
                  activeFilterCount={debouncedSearch ? 1 : 0}
                  onClearAll={() => {
                    setSearchInput("");
                    setDebouncedSearch("");
                    setPage(1);
                  }}
                />
              }
              pagination={
                !usageQuery.isLoading && items.length > 0 ? (
                  <PaginationFooter
                    page={page}
                    totalPages={totalPages}
                    total={total}
                    pageSize={12}
                    onPageChange={setPage}
                  />
                ) : undefined
              }
            >
              {usageQuery.isLoading ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Plan</TableHead>
                      {view === "trial" && <TableHead>Trial</TableHead>}
                      <TableHead className="text-right">Gen / Pub / Fail</TableHead>
                      <TableHead className="text-right">Tokens (in / out)</TableHead>
                      <TableHead className="text-right">Window cost</TableHead>
                      <TableHead>Quota used</TableHead>
                      <TableHead>Today spend / cap</TableHead>
                      <TableHead className="text-right">Playground today</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableSkeleton columns={view === "trial" ? 9 : 8} rows={6} />
                </Table>
              ) : items.length === 0 ? (
                <EmptyState
                  icon={Activity}
                  title="No users found"
                  description="No usage rows match your search."
                  action={
                    debouncedSearch ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSearchInput("");
                          setDebouncedSearch("");
                        }}
                      >
                        Clear search
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Plan</TableHead>
                      {view === "trial" && <TableHead>Trial</TableHead>}
                      <TableHead className="text-right">Gen / Pub / Fail</TableHead>
                      <TableHead className="text-right">Tokens (in / out)</TableHead>
                      <TableHead className="text-right">Window cost</TableHead>
                      <TableHead className="min-w-[160px]">Quota used</TableHead>
                      <TableHead className="min-w-[150px]">Daily spend</TableHead>
                      <TableHead className="text-right">Playground today</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="flex items-center gap-2.5 min-w-[180px]">
                            <UserAvatar userId={u.id} name={u.name} email={u.email} size="sm" />
                            <div className="min-w-0">
                              <Link
                                href={`/admin/users/${u.id}`}
                                className="font-medium text-sm hover:underline block truncate max-w-[150px]"
                              >
                                {u.name}
                              </Link>
                              <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                                {u.email}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <PlanBadge planId={u.plan_id} planName={u.plan_name} />
                            <StatusBadge kind="subscription" value={u.effective_status} />
                          </div>
                        </TableCell>
                        {view === "trial" && (
                          <TableCell>
                            {u.trial_days_left !== null ? (
                              <DaysLeftChip daysLeft={u.trial_days_left} />
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell className="text-xs text-right tabular-nums whitespace-nowrap">
                          {u.posts_generated} / {u.posts_published} /{" "}
                          <span
                            className={
                              u.failed_runs > 0
                                ? "text-red-700 dark:text-red-300 font-semibold"
                                : ""
                            }
                          >
                            {u.failed_runs}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums whitespace-nowrap">
                          {u.tokens_in.toLocaleString()} / {u.tokens_out.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-right tabular-nums whitespace-nowrap">
                          ${u.cost_usd.toFixed(4)}
                        </TableCell>
                        <TableCell>
                          <UsageBar used={u.quota_used} limit={u.quota_limit} compact />
                        </TableCell>
                        <TableCell>
                          {u.daily_spend_limit_usd !== null ? (
                            <UsageBar
                              used={Number(u.today_spend_usd.toFixed(4))}
                              limit={u.daily_spend_limit_usd}
                              compact
                              tooltip={`Today $${u.today_spend_usd.toFixed(4)} / Cap $${u.daily_spend_limit_usd.toFixed(2)}`}
                            />
                          ) : (
                            <span className="text-xs font-mono tabular-nums text-muted-foreground">
                              ${u.today_spend_usd.toFixed(4)} / ∞
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums whitespace-nowrap">
                          {u.playground_today_used}
                          {u.playground_daily_limit !== null ? ` / ${u.playground_daily_limit}` : ""}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </DataTableShell>
          )}

          {sourcesNote && (
            <Card className="rounded-lg border-border bg-card shadow-xs">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Data Sources</CardTitle>
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
