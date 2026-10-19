import { auth } from "@/lib/auth/server";

// Proxies all Neon Auth authentication endpoints through Next.js API route
// Reference: https://neon.com/docs/auth/quick-start/nextjs-api-only
export const { GET, POST, PUT, DELETE, PATCH } = auth.handler();
