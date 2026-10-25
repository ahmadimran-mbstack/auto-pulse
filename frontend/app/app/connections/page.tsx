import { auth } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { ConnectionsClient } from "./ConnectionsClient";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const { data: session } = await auth.getSession();

  if (!session?.user) {
    redirect("/auth/sign-in");
  }

  const user = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
  };

  return <ConnectionsClient user={user} />;
}
