import { Suspense } from "react";
import { SettingsClient } from "./SettingsClient";
import { SettingsSkeleton } from "@/components/app/SettingsSkeleton";

export const metadata = {
  title: "Settings - AutoPulse",
  description: "Manage your profile, content preferences, brand styling, schedule, and account.",
};

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsClient />
    </Suspense>
  );
}
