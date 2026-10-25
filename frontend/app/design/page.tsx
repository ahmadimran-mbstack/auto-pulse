import { notFound } from "next/navigation";
import { DesignGuideClient } from "./DesignGuideClient";
import { AppQueryProvider } from "@/components/providers/query-provider";

// 404 in production as specified in design requirements
export default function DesignPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <AppQueryProvider>
      <DesignGuideClient />
    </AppQueryProvider>
  );
}
