import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { BillingClient } from "./BillingClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Plan & Billing - AutoPulse",
  description: "View your current plan, usage limits, and available upgrades.",
};

export default async function BillingPage() {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    redirect("/auth/sign-in");
  }

  return (
    <BillingClient
      user={{
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
      }}
    />
  );
}
