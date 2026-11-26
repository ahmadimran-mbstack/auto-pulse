import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { isServerAdmin } from "@/lib/admin-server";
import { PostLoginRedirectClient } from "./PostLoginRedirectClient";

export const dynamic = "force-dynamic";

export default async function PostLoginPage() {
  let session = null;
  try {
    const res = await auth.getSession();
    session = res?.data;
  } catch {
    session = null;
  }

  if (!session?.user) {
    redirect("/auth/sign-in");
  }

  const token = (session as { session?: { token?: string } } | null)?.session?.token;
  if (token) {
    const isAdmin = await isServerAdmin(token);
    if (isAdmin) {
      redirect("/admin");
    }
    redirect("/app");
  }

  return <PostLoginRedirectClient />;
}
