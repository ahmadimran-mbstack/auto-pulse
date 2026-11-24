import * as React from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { AppQueryProvider } from "@/components/providers/query-provider";
import { UserProvider, type AppUser } from "@/components/providers/user-provider";
import { AdminGate } from "./AdminGate";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const isSignedOut = cookieStore.get("autopulse_signed_out")?.value === "true";

  let session = null;
  try {
    const res = await auth.getSession();
    session = res?.data;
  } catch {
    session = null;
  }

  if (isSignedOut || !session?.user) {
    redirect("/auth/sign-in");
  }

  const user: AppUser = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
  };

  return (
    <AppQueryProvider>
      <UserProvider initialUser={user}>
        <AdminGate>{children}</AdminGate>
      </UserProvider>
    </AppQueryProvider>
  );
}
