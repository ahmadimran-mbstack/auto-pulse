"use client";

import * as React from "react";

interface SidebarContextType {
  open: boolean;
  setOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  toggle: () => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  toggleMobile: () => void;
  isReady: boolean;
}

const SidebarContext = React.createContext<SidebarContextType | null>(null);

export function useAppSidebarState() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useAppSidebarState must be used within an AppSidebarProvider");
  }
  return context;
}

export function AppSidebarProvider({
  initialOpen = true,
  children,
}: {
  initialOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpenState] = React.useState(initialOpen);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [isReady, setIsReady] = React.useState(false);

  // Initialize and mark ready after hydration so first page load does not animate
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("sidebar_state");
      if (saved !== null) {
        setOpenState(saved === "true");
      }
    } catch {}
    // Next tick enables CSS transitions smoothly
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  const setOpen = React.useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setOpenState((prev) => {
        const next = typeof value === "function" ? value(prev) : value;
        document.cookie = `sidebar_state=${next}; path=/; max-age=604800; SameSite=Lax`;
        try {
          localStorage.setItem("sidebar_state", String(next));
        } catch {}
        return next;
      });
    },
    []
  );

  const toggle = React.useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileOpen((prev) => !prev);
    } else {
      setOpen((prev) => !prev);
    }
  }, [setOpen]);

  const toggleMobile = React.useCallback(() => {
    setMobileOpen((prev) => !prev);
  }, []);

  // Keyboard shortcut: Ctrl+B or Cmd+B to toggle sidebar
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "b" || e.key === "B")) {
        const target = e.target as HTMLElement | null;
        const isInput =
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable);
        if (!isInput) {
          e.preventDefault();
          toggle();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggle]);

  return (
    <SidebarContext.Provider
      value={{
        open,
        setOpen,
        toggle,
        mobileOpen,
        setMobileOpen,
        toggleMobile,
        isReady,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

