"use client";

import { createAuthClient } from "@neondatabase/auth/next";

// Client-side auth client for browser components
// Reference: https://neon.com/docs/auth/quick-start/nextjs-api-only
export const authClient = createAuthClient();
