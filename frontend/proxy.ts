import { auth } from "@/lib/auth/server";

// Next.js 16 proxy configuration to protect routes requiring authentication
// Reference: https://neon.com/docs/auth/quick-start/nextjs-api-only
export default auth.middleware({
  loginUrl: "/auth/sign-in",
});

export const config = {
  matcher: ["/app/:path*"],
};
