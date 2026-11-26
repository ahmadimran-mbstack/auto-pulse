import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
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

  return <PostLoginRedirectClient />;
}
