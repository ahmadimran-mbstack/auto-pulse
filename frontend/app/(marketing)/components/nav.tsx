// This component renders the Aceternity UI floating navbar with transparent blurred background and rounded-full shape.
"use client";

import React from "react";
import { FloatingNav } from "@/components/ui/floating-navbar";

export function Nav() {
  const navItems = [
    {
      name: "Product",
      link: "#features",
    },
    {
      name: "How it works",
      link: "#how-it-works",
    },
    {
      name: "FAQ",
      link: "#faq",
    },
  ];

  return <FloatingNav navItems={navItems} />;
}
