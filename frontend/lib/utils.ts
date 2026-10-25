import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Combines class names with tailwind-merge to resolve conflicts cleanly
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
