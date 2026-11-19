"use client";

import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { subscribeAuthAnnouncement } from "@/lib/auth-toast";
import {
  CircleCheck,
  CircleX,
  Info,
  Loader2,
  TriangleAlert,
} from "lucide-react";

// Dark-only Sonner Toaster mounted exclusively inside AuthLayout
export function AuthToaster() {
  const [announcement, setAnnouncement] = useState("");

  // Updates the screen-reader alert text whenever authToast.error or .warning fires
  useEffect(() => {
    return subscribeAuthAnnouncement((message) => {
      setAnnouncement("");
      requestAnimationFrame(() => setAnnouncement(message));
    });
  }, []);

  return (
    <>
      {/* Hidden live region so screen readers hear auth errors without moving focus */}
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>

      {/* Top-center dark toast container showing at most one auth toast at a time */}
      <Toaster
        theme="dark"
        position="top-center"
        visibleToasts={1}
        closeButton
        swipeDirections={["top", "left", "right"]}
        className="dark auth-toaster toaster group font-sans"
        icons={{
          success: (
            <CircleCheck
              className="size-[18px] shrink-0 text-[var(--status-success-fg)]"
              aria-hidden="true"
            />
          ),
          error: (
            <CircleX
              className="size-[18px] shrink-0 text-[var(--status-danger-fg)]"
              aria-hidden="true"
            />
          ),
          warning: (
            <TriangleAlert
              className="size-[18px] shrink-0 text-[var(--status-warning-fg)]"
              aria-hidden="true"
            />
          ),
          info: (
            <Info
              className="size-[18px] shrink-0 text-[var(--status-info-fg)]"
              aria-hidden="true"
            />
          ),
          loading: (
            <Loader2
              className="size-[18px] shrink-0 animate-spin text-[#9AA3B2]"
              aria-hidden="true"
            />
          ),
        }}
        style={
          {
            "--normal-bg": "#0F1115",
            "--normal-text": "#FFFFFF",
            "--normal-border": "rgba(255, 255, 255, 0.12)",
            "--border-radius": "12px",
            "--width": "360px",
            fontFamily: "var(--font-sans, inherit)",
          } as React.CSSProperties
        }
        toastOptions={{
          classNames: {
            toast:
              "auth-toast font-sans !font-normal !bg-[#0F1115] !text-white !border !border-white/12 !rounded-[12px]",
            title: "!text-[14px] !leading-[1.4] !font-normal !text-white",
            description:
              "!text-[13px] !leading-[1.4] !font-normal !text-[#9AA3B2]",
            actionButton:
              "!font-normal !text-[13px] !rounded-[8px] !bg-white !text-[#08090C] hover:!bg-[#BFD2EE]",
            cancelButton:
              "!font-normal !text-[13px] !rounded-[8px] !bg-white/10 !text-white",
            closeButton:
              "!bg-[#0F1115] !text-[#9AA3B2] !border-white/12 hover:!text-white hover:!bg-white/10",
          },
          style: {
            fontFamily: "var(--font-sans, inherit)",
            fontWeight: 400,
            background: "#0F1115",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: "12px",
            boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.08)",
          },
        }}
      />
    </>
  );
}
