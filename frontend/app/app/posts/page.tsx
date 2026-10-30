import { Suspense } from "react";
import { auth } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { PostsClient } from "./PostsClient";
import { PostsSkeleton } from "@/components/app/PostsSkeleton";

export const dynamic = "force-dynamic";

export default async function PostsPage() {
  const { data: session } = await auth.getSession();

  if (!session?.user) {
    redirect("/auth/sign-in");
  }

  const user = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
  };

  return (
    <Suspense fallback={<PostsSkeleton />}>
      <PostsClient user={user} />
    </Suspense>
  );
}
