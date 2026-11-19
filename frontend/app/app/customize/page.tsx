import { Suspense } from "react";
import { CustomizeClient } from "./CustomizeClient";
import { SettingsSkeleton } from "@/components/app/SettingsSkeleton";

export const metadata = {
  title: "Customize - AutoPulse",
  description: "Upload LinkedIn playbooks, business context, previous posts, and custom instructions.",
};

export default function CustomizePage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <CustomizeClient />
    </Suspense>
  );
}
