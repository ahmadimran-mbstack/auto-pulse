import { SettingsClient } from "./SettingsClient";

export const metadata = {
  title: "Settings - AutoPulse",
  description: "Manage your profile, content preferences, brand styling, schedule, and account.",
};

export default function SettingsPage() {
  return <SettingsClient />;
}
