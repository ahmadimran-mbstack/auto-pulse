"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { LifeBuoy, MessageSquare } from "lucide-react";

import { AdminExportButton } from "@/components/admin/export-button";
import {
  DataTableShell,
  EmptyState,
  ErrorState,
  PageHeader,
  PaginationFooter,
  RelativeTime,
  StatusBadge,
  TableSkeleton,
  Toolbar,
  UserAvatar,
} from "@/components/admin/shared";
import { SUPPORT_CATEGORY_LABELS } from "@/components/support/support-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAdminSupportTickets } from "@/lib/api";

export default function AdminSupportTicketsPage() {
  const router = useRouter();
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [priorityFilter, setPriorityFilter] = React.useState("all");
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const query = useQuery({
    queryKey: ["admin-support-tickets", statusFilter, priorityFilter, categoryFilter, search, page],
    queryFn: () =>
      getAdminSupportTickets({
        status: statusFilter,
        priority: priorityFilter,
        category: categoryFilter,
        search,
        page,
        page_size: 20,
      }),
  });

  const summary = query.data?.summary || { open: 0, in_progress: 0, resolved: 0 };
  const items = query.data?.items || [];
  const total = query.data?.total || 0;
  const totalPages = query.data?.total_pages || 1;

  const activeFilters =
    (search ? 1 : 0) +
    (priorityFilter !== "all" ? 1 : 0) +
    (categoryFilter !== "all" ? 1 : 0);

  const clearAll = () => {
    setSearchInput("");
    setSearch("");
    setPriorityFilter("all");
    setCategoryFilter("all");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support Tickets"
        description="Respond to customer requests, add internal notes, and manage ticket statuses."
        actions={
          <AdminExportButton
            kind="support-tickets"
            params={{
              status: statusFilter,
              priority: priorityFilter,
              category: categoryFilter,
              search: search || undefined,
            }}
          />
        }
      />

      <Tabs
        value={statusFilter}
        onValueChange={(v) => {
          setStatusFilter(v);
          setPage(1);
        }}
      >
        <TabsList className="flex-wrap">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="open" className="gap-1.5">
            Open
            <Badge variant="secondary" className="h-5 px-1.5 text-[11px] tabular-nums">
              {summary.open}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="in_progress" className="gap-1.5">
            In progress
            <Badge variant="secondary" className="h-5 px-1.5 text-[11px] tabular-nums">
              {summary.in_progress}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="resolved" className="gap-1.5">
            Resolved
            <Badge variant="secondary" className="h-5 px-1.5 text-[11px] tabular-nums">
              {summary.resolved}
            </Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {query.isError ? (
        <ErrorState
          title="Could not load support tickets"
          message="Failed to fetch tickets list."
          onRetry={() => query.refetch()}
        />
      ) : (
        <DataTableShell
          toolbar={
            <Toolbar
              searchValue={searchInput}
              onSearchChange={setSearchInput}
              searchPlaceholder="Search subject, email, or name..."
              activeFilterCount={activeFilters}
              onClearAll={clearAll}
              filters={
                <>
                  <Select
                    value={priorityFilter}
                    onValueChange={(v) => {
                      setPriorityFilter(v);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="w-36 h-9">
                      <SelectValue placeholder="All priorities" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All priorities</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={categoryFilter}
                    onValueChange={(v) => {
                      setCategoryFilter(v);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="w-44 h-9">
                      <SelectValue placeholder="All categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      {Object.entries(SUPPORT_CATEGORY_LABELS).map(([k, label]) => (
                        <SelectItem key={k} value={k}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              }
            />
          }
          pagination={
            !query.isLoading && items.length > 0 ? (
              <PaginationFooter
                page={page}
                totalPages={totalPages}
                total={total}
                pageSize={20}
                onPageChange={setPage}
              />
            ) : undefined
          }
        >
          {query.isLoading ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last activity</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableSkeleton columns={7} rows={6} />
            </Table>
          ) : items.length === 0 ? (
            <EmptyState
              icon={LifeBuoy}
              title="No matching support tickets"
              description="No tickets match the selected status or filters."
              action={
                activeFilters > 0 ? (
                  <Button size="sm" variant="outline" onClick={clearAll}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last activity</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((t) => (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/admin/support/${t.id}`)}
                  >
                    <TableCell className="max-w-xs">
                      <Link
                        href={`/admin/support/${t.id}`}
                        className="font-medium text-sm hover:underline block truncate"
                      >
                        {t.subject}
                      </Link>
                      {typeof t.message_count === "number" && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums mt-0.5">
                          <MessageSquare className="size-3" />
                          {t.message_count} messages
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-[170px]">
                        <UserAvatar
                          userId={t.user_id}
                          name={t.user_name}
                          email={t.user_email}
                          size="xs"
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate max-w-[150px]">
                            {t.user_name || t.user_email || t.user_id}
                          </div>
                          {t.user_email && (
                            <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                              {t.user_email}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[11px] font-normal">
                        {SUPPORT_CATEGORY_LABELS[t.category] || t.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge kind="priority" value={t.priority} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge kind="ticket" value={t.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <RelativeTime iso={t.last_message_at} />
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/support/${t.id}`}>Open</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DataTableShell>
      )}
    </div>
  );
}
