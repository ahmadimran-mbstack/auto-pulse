import type { Metadata } from "next";
import { Manrope, Geist } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Configure DM Sans for all UI body text
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

// Configure Bricolage Grotesque for page titles and display headings
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AutoPulse: Daily LinkedIn posts. You approve each one.",
  description:
    "AutoPulse finds what is trending in your field, writes the post, designs the image, and sends it to you to approve. Nothing goes live until you say so.",
  openGraph: {
    title: "AutoPulse: Daily LinkedIn posts. You approve each one.",
    description:
      "AutoPulse finds what is trending in your field, writes the post, designs the image, and sends it to you to approve. Nothing goes live until you say so.",
    type: "website",
  },
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${manrope.variable}`}
    >
      <body className="min-h-screen bg-background text-foreground font-sans antialiased flex flex-col">
        <TooltipProvider>
          {children}
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
