"use client";

import * as React from "react";
import { authClient } from "@/lib/auth/client";

export interface AppUser {
  id: string;
  name?: string | null;
  email: string;
  image?: string | null;
}

const UserContext = React.createContext<{
  user: AppUser;
  refreshUser: () => Promise<void>;
}>({
  user: { id: "anonymous", name: "User", email: "user@example.com" },
  refreshUser: async () => {},
});

export function UserProvider({
  initialUser,
  children,
}: {
  initialUser: AppUser;
  children: React.ReactNode;
}) {
  const [user, setUser] = React.useState<AppUser>(initialUser);

  // Synchronize when initialUser prop updates
  const [prevInitial, setPrevInitial] = React.useState(initialUser);
  if (initialUser !== prevInitial) {
    setPrevInitial(initialUser);
    setUser(initialUser);
  }

  // Refreshes the user from Neon Auth session
  const refreshUser = React.useCallback(async () => {
    try {
      const sessionResult = await authClient.getSession();
      if (sessionResult?.data?.user) {
        const u = sessionResult.data.user;
        setUser({
          id: u.id,
          name: u.name,
          email: u.email || initialUser.email,
          image: u.image || null,
        });
      }
    } catch (err) {
      console.warn("Failed to refresh session user:", err);
    }
  }, [initialUser.email]);

  return (
    <UserContext.Provider value={{ user, refreshUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): { user: AppUser; refreshUser: () => Promise<void> } {
  return React.useContext(UserContext);
}
