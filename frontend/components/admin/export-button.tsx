"use client";

import * as React from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ApiClientError, downloadAdminCsv } from "@/lib/api";

interface AdminExportButtonProps {
  kind: "users" | "payments" | "subscribers" | "usage" | "support-tickets";
  params?: Record<string, string | number | undefined | null>;
  label?: string;
}

export function AdminExportButton({
  kind,
  params = {},
  label = "Export CSV",
}: AdminExportButtonProps) {
  const [exporting, setExporting] = React.useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const { truncated, filename } = await downloadAdminCsv(kind, params);
      if (truncated) {
        toast.warning(`Exported ${filename} (capped at 50,000 rows). Narrow filters for full data.`);
      } else {
        toast.success(`Exported ${filename}`);
      }
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not export CSV.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
      {exporting ? (
        <Loader2 className="size-4 mr-1.5 animate-spin" />
      ) : (
        <Download className="size-4 mr-1.5" />
      )}
      {label}
    </Button>
  );
}
