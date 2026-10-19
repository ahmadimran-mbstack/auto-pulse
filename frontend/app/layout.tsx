import type { Metadata } from "next";
import { Manrope, Geist } from "next/font/google";
import "./globals.css";

// Configure Manrope display font for headings
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Configure Geist body font
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AutoPulse - Daily LinkedIn posts. You approve each one.",
  description:
    "AutoPulse finds what is trending in your field, writes the post, designs the image, and sends it to you to approve. Nothing goes live until you say so.",
  openGraph: {
    title: "AutoPulse - Daily LinkedIn posts. You approve each one.",
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
    <html lang="en" className={`${manrope.variable} ${geist.variable}`}>
      <body className="min-h-screen bg-paper text-ink font-manrope antialiased flex flex-col">
        {children}
      </body>
    </html>
  );
}
