import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

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
      className={GeistSans.variable}
      suppressHydrationWarning
      data-scroll-behavior="smooth"
    >
      <body
        className="min-h-screen bg-background text-foreground font-sans antialiased flex flex-col font-normal"
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
