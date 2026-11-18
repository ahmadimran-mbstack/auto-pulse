import { auth } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { PostDetailClient } from "./PostDetailClient";

// Server components reading session data must be dynamic
export const dynamic = "force-dynamic";

interface PostPageProps {
  params: Promise<{ id: string }>;
}

export default async function PostPage({ params }: PostPageProps) {
  const { id } = await params;
  const { data: session } = await auth.getSession();

  if (!session?.user) {
    redirect("/auth/sign-in");
  }

  // Redirect unverified users to sign-in so they cannot bypass email verification
  if (!session.user.emailVerified) {
    redirect("/auth/sign-in");
  }

  return <PostDetailClient id={id} />;
}
