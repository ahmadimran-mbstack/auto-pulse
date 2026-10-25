"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  ActivityIcon,
  Loader2Icon,
  AlertCircleIcon,
  InfoIcon,
  PlusIcon,
  SettingsIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTable, type DataTableItem } from "@/components/data-table";

// Custom AutoPulse components
import { PageHeader } from "@/components/app/PageHeader";
import { Section } from "@/components/app/Section";
import { EmptyState } from "@/components/app/EmptyState";
import { ErrorState } from "@/components/app/ErrorState";
import { TagInput } from "@/components/app/TagInput";
import { ColorField } from "@/components/app/ColorField";
import { StatusBadge } from "@/components/app/StatusBadge";
import { BrandPreviewCard } from "@/components/app/BrandPreviewCard";
import { PostThumbnail } from "@/components/app/PostThumbnail";

// Form validation schema
const demoFormSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Enter a valid email address"),
  role: z.string().min(1, "Select your role"),
  notes: z.string().min(5, "Notes must be at least 5 characters"),
  agree: z.boolean().refine((val) => val === true, "You must accept the terms"),
});

type DemoFormValues = z.infer<typeof demoFormSchema>;

const sampleTableData: DataTableItem[] = [
  {
    id: 1,
    header: "How Postgres Vector Search Beats Pinecone on Latency",
    type: "Technical Analysis",
    status: "Done",
    target: "10k",
    limit: "15k",
    reviewer: "Eddie Lake",
  },
  {
    id: 2,
    header: "Why Server Actions in Next.js 16 Simplify Auth",
    type: "Architecture",
    status: "In Progress",
    target: "8k",
    limit: "12k",
    reviewer: "Jamik Tashpulatov",
  },
  {
    id: 3,
    header: "Five Micro-Benchmarks for Tailwind v4 Performance",
    type: "Benchmarking",
    status: "Done",
    target: "12k",
    limit: "18k",
    reviewer: "Assign reviewer",
  },
];

export function DesignGuideClient() {
  const [selectedColor, setSelectedColor] = React.useState(["#", "0B7F70"].join(""));
  const [demoTags, setDemoTags] = React.useState([
    "Postgres",
    "TailwindCSS",
    "TypeScript",
  ]);

  const form = useForm<DemoFormValues>({
    resolver: zodResolver(demoFormSchema),
    defaultValues: {
      fullName: "",
      email: "",
      role: "",
      notes: "",
      agree: false,
    },
  });

  const onFormSubmit = (data: DemoFormValues) => {
    toast.success("Form validated successfully", {
      description: `Welcome ${data.fullName}!`,
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Top sticky navigation bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="page-container mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ActivityIcon className="size-4" strokeWidth={1.5} />
            </div>
            <span className="font-display text-base font-semibold text-foreground tracking-tight">
              AutoPulse Design System
            </span>
            <Badge variant="neutral" className="text-xs">
              Style Guide & Token Reference
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/app">
              <Button variant="outline" size="sm">
                Open App Shell
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="page-container mx-auto px-4 md:px-6 py-8 space-y-12">
        {/* Page Header */}
        <PageHeader
          title="Design System & Component Index"
          description="Canonical token specifications, typographic scales, spacing units, and states for all shadcn and custom components."
          actions={
            <Button
              variant="default"
              size="sm"
              onClick={() => toast.info("Style guide is up to date")}
            >
              Verify Tokens
            </Button>
          }
        />

        {/* 1. TOKENS SECTION */}
        <Section
          title="1. Semantic Color Tokens"
          description="Every color in AutoPulse is defined as a semantic token in globals.css. Raw hex and arbitrary values are forbidden outside globals.css."
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {/* Background & Foreground */}
            <ColorSwatchCard
              name="background"
              cssVar="--background"
              hex="F6F7F9"
              className="bg-background text-foreground border border-border"
            />
            <ColorSwatchCard
              name="foreground"
              cssVar="--foreground"
              hex="12141A"
              className="bg-foreground text-background"
            />
            {/* Card & Popover */}
            <ColorSwatchCard
              name="card"
              cssVar="--card"
              hex="FFFFFF"
              className="bg-card text-card-foreground border border-border"
            />
            <ColorSwatchCard
              name="popover"
              cssVar="--popover"
              hex="FFFFFF"
              className="bg-popover text-popover-foreground border border-border"
            />
            {/* Primary & States */}
            <ColorSwatchCard
              name="primary"
              cssVar="--primary"
              hex="0B7F70"
              className="bg-primary text-primary-foreground"
            />
            <ColorSwatchCard
              name="primary-hover"
              cssVar="--primary-hover"
              hex="096A5D"
              className="bg-primary-hover text-primary-foreground"
            />
            <ColorSwatchCard
              name="primary-active"
              cssVar="--primary-active"
              hex="07584D"
              className="bg-primary-active text-primary-foreground"
            />
            {/* Neutrals */}
            <ColorSwatchCard
              name="secondary"
              cssVar="--secondary"
              hex="EEF0F4"
              className="bg-secondary text-secondary-foreground border border-border"
            />
            <ColorSwatchCard
              name="muted"
              cssVar="--muted"
              hex="EEF0F4"
              className="bg-muted text-muted-foreground border border-border"
            />
            <ColorSwatchCard
              name="muted-fg"
              cssVar="--muted-foreground"
              hex="5B6270"
              className="bg-muted-foreground text-card"
            />
            <ColorSwatchCard
              name="accent"
              cssVar="--accent"
              hex="EEF0F4"
              className="bg-accent text-accent-foreground border border-border"
            />
            <ColorSwatchCard
              name="destructive"
              cssVar="--destructive"
              hex="B4412E"
              className="bg-destructive text-destructive-foreground"
            />
            {/* Borders & Inputs */}
            <ColorSwatchCard
              name="border"
              cssVar="--border"
              hex="E2E5EB"
              className="bg-border text-foreground"
            />
            <ColorSwatchCard
              name="input"
              cssVar="--input"
              hex="CBD0D9"
              className="bg-input text-foreground"
            />
            <ColorSwatchCard
              name="ring"
              cssVar="--ring"
              hex="0B7F70"
              className="bg-ring text-primary-foreground"
            />
            {/* Status & Signals */}
            <ColorSwatchCard
              name="signal-soft"
              cssVar="--signal-soft"
              hex="E3F4F1"
              className="bg-signal-soft text-primary border border-signal-line"
            />
            <ColorSwatchCard
              name="signal-line"
              cssVar="--signal-line"
              hex="B9E2DB"
              className="bg-signal-line text-foreground"
            />
            <ColorSwatchCard
              name="status-draft-bg"
              cssVar="--status-draft-bg"
              hex="FBF1DC"
              className="bg-status-draft-bg text-status-draft-fg"
            />
            <ColorSwatchCard
              name="status-draft-fg"
              cssVar="--status-draft-fg"
              hex="8A5A0B"
              className="bg-status-draft-fg text-card"
            />
            <ColorSwatchCard
              name="status-danger-bg"
              cssVar="--status-danger-bg"
              hex="FBE9E5"
              className="bg-status-danger-bg text-status-danger-fg"
            />
            <ColorSwatchCard
              name="status-danger-fg"
              cssVar="--status-danger-fg"
              hex="B4412E"
              className="bg-status-danger-fg text-card"
            />
            {/* Sidebar Tokens */}
            <ColorSwatchCard
              name="sidebar"
              cssVar="--sidebar"
              hex="FFFFFF"
              className="bg-sidebar text-sidebar-foreground border border-sidebar-border"
            />
            <ColorSwatchCard
              name="sidebar-accent"
              cssVar="--sidebar-accent"
              hex="EEF0F4"
              className="bg-sidebar-accent text-sidebar-accent-foreground"
            />
            <ColorSwatchCard
              name="sidebar-border"
              cssVar="--sidebar-border"
              hex="E2E5EB"
              className="bg-sidebar-border text-sidebar-foreground"
            />
          </div>
        </Section>

        {/* 2. TYPE SCALE SECTION */}
        <Section
          title="2. Typographic Scale"
          description="DM Sans for body and interactive UI, Bricolage Grotesque 600 for page titles and display headings. Tabular figures for dates, metrics, and times."
        >
          <div className="space-y-4 rounded-lg border border-border bg-card p-6">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between border-b border-border pb-3 gap-1">
              <span className="text-xs font-mono text-muted-foreground w-40">
                page title (32/40)
              </span>
              <h1 className="font-display text-title flex-1">
                Engineering Niche Intelligence
              </h1>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between border-b border-border pb-3 gap-1">
              <span className="text-xs font-mono text-muted-foreground w-40">
                heading 2 (24/32)
              </span>
              <h2 className="text-h2 flex-1">
                Daily Verified Drafts for Technical Audiences
              </h2>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between border-b border-border pb-3 gap-1">
              <span className="text-xs font-mono text-muted-foreground w-40">
                heading 3 (20/28)
              </span>
              <h3 className="text-h3 flex-1">
                Automated discovery pipeline with human approval gate
              </h3>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between border-b border-border pb-3 gap-1">
              <span className="text-xs font-mono text-muted-foreground w-40">
                lead (16/24)
              </span>
              <p className="text-lead flex-1 text-foreground">
                Review, refine, and approve your niche LinkedIn post before nine in the morning.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between border-b border-border pb-3 gap-1">
              <span className="text-xs font-mono text-muted-foreground w-40">
                body default (14/22)
              </span>
              <p className="text-body flex-1 text-foreground">
                AutoPulse crawls engineering publications, extracts actionable trends, and crafts a post tailored to your personal brand identity.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between border-b border-border pb-3 gap-1">
              <span className="text-xs font-mono text-muted-foreground w-40">
                table & meta (13/20)
              </span>
              <p className="text-meta flex-1 text-muted-foreground">
                Last generated: Oct 25, 2026, 08:30 UTC · Status: Awaiting review
              </p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between border-b border-border pb-3 gap-1">
              <span className="text-xs font-mono text-muted-foreground w-40">
                caption (12/16)
              </span>
              <p className="text-caption flex-1 text-muted-foreground">
                Characters: 842 / 3000 · WCAG 2.1 AA Contrast Passed (5.4:1)
              </p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between pt-1 gap-1">
              <span className="text-xs font-mono text-muted-foreground w-40">
                tabular numbers
              </span>
              <div className="flex-1 tabular-nums flex flex-wrap gap-6 text-sm">
                <span>08:45:00 UTC</span>
                <span>$1,240.50</span>
                <span>47 / 100</span>
                <span>99.98%</span>
              </div>
            </div>
          </div>
        </Section>

        {/* 3. SPACING SCALE */}
        <Section
          title="3. Spacing Scale & Control Geometry"
          description="Strict 4px Tailwind scale steps: 1, 2, 3, 4, 5, 6, 8, 10, 12, 16. Controls: 6px radius (rounded-md), Panels: 8px radius (rounded-lg)."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-lg border border-border bg-card p-4 space-y-2">
              <span className="text-xs font-semibold text-muted-foreground">
                Tailwind 4px Steps
              </span>
              <div className="space-y-1.5 text-xs font-mono">
                <SpacingBar step="1" px="4px" className="w-1" />
                <SpacingBar step="2" px="8px" className="w-2" />
                <SpacingBar step="3" px="12px" className="w-3" />
                <SpacingBar step="4" px="16px" className="w-4" />
                <SpacingBar step="5" px="20px" className="w-5" />
                <SpacingBar step="6" px="24px" className="w-6" />
                <SpacingBar step="8" px="32px" className="w-8" />
                <SpacingBar step="10" px="40px" className="w-10" />
                <SpacingBar step="12" px="48px" className="w-12" />
                <SpacingBar step="16" px="64px" className="w-16" />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 space-y-4">
              <span className="text-xs font-semibold text-muted-foreground block">
                Standard Control Heights & Radii
              </span>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span>Control Height 32px (h-8, rounded-md 6px)</span>
                  <Button size="sm" variant="outline">
                    h-8 (32px)
                  </Button>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span>Control Height 36px (h-9, rounded-md 6px)</span>
                  <Button size="md" variant="outline">
                    h-9 (36px)
                  </Button>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span>Control Height 44px (h-11, rounded-md 6px)</span>
                  <Button size="lg" variant="outline">
                    h-11 (44px)
                  </Button>
                </div>
                <div className="flex items-center justify-between text-xs border-t border-border pt-2">
                  <span>List Row Height (h-12, 48px)</span>
                  <div className="h-12 w-28 rounded-md border border-border bg-muted flex items-center justify-center font-mono text-xs">
                    48px row
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* 4. BUTTONS & STATES */}
        <Section
          title="4. Buttons in Every State"
          description="Flat by default with zero elevation. 120ms ease-out transitions. States: Default, Hover, Focus, Disabled, and Loading."
        >
          <div className="space-y-6 rounded-lg border border-border bg-card p-6">
            {/* Variants */}
            <div>
              <span className="text-xs font-semibold text-muted-foreground block mb-3">
                Variants (Default State)
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="default">Primary Default</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive</Button>
                <Button variant="link">Link Style</Button>
              </div>
            </div>

            {/* States */}
            <div>
              <span className="text-xs font-semibold text-muted-foreground block mb-3">
                Interactive States
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="default">Normal State</Button>
                <Button variant="default" className="bg-primary-hover">
                  Hover State
                </Button>
                <Button
                  variant="default"
                  className="ring-2 ring-ring ring-offset-2"
                >
                  Focus State
                </Button>
                <Button variant="default" disabled>
                  Disabled State
                </Button>
                <Button variant="default" disabled className="gap-2">
                  <Loader2Icon className="size-4 animate-spin" />
                  <span>Loading...</span>
                </Button>
              </div>
            </div>

            {/* Outline States */}
            <div>
              <span className="text-xs font-semibold text-muted-foreground block mb-3">
                Outline States
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline">Outline Normal</Button>
                <Button variant="outline" className="bg-muted text-foreground">
                  Outline Hover
                </Button>
                <Button
                  variant="outline"
                  className="ring-2 ring-ring ring-offset-2"
                >
                  Outline Focus
                </Button>
                <Button variant="outline" disabled>
                  Outline Disabled
                </Button>
              </div>
            </div>

            {/* Sizes */}
            <div>
              <span className="text-xs font-semibold text-muted-foreground block mb-3">
                Control Sizes & Icon Buttons
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm">Small (32px)</Button>
                <Button size="default">Default (32px)</Button>
                <Button size="md">Medium (36px)</Button>
                <Button size="lg">Large (44px)</Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="outline" aria-label="Settings action">
                      <SettingsIcon className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open settings</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon-md" variant="default" aria-label="Add item">
                      <PlusIcon className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Create new post</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </Section>

        {/* 5. FORM CONTROLS & FORM SYSTEM */}
        <Section
          title="5. Form Controls & Validation System"
          description="Input, Textarea, Select, Checkbox, Radio Group, and react-hook-form integration with Zod schemas in default, focus, disabled, and error states."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Primitive states */}
            <div className="space-y-4 rounded-lg border border-border bg-card p-6">
              <span className="text-xs font-semibold text-muted-foreground block">
                Field States
              </span>

              {/* Default Input */}
              <div className="space-y-1.5">
                <Label htmlFor="input-default">Default Input</Label>
                <Input id="input-default" placeholder="Enter text..." />
              </div>

              {/* Disabled Input */}
              <div className="space-y-1.5">
                <Label htmlFor="input-disabled" className="opacity-50">
                  Disabled Input
                </Label>
                <Input
                  id="input-disabled"
                  disabled
                  value="Read-only system value"
                />
              </div>

              {/* Error Input */}
              <div className="space-y-1.5">
                <Label htmlFor="input-error" className="text-destructive">
                  Input with Error
                </Label>
                <Input
                  id="input-error"
                  aria-invalid="true"
                  defaultValue="invalid@broken"
                />
                <p className="text-xs text-destructive font-medium">
                  Please provide a valid domain email address.
                </p>
              </div>

              {/* Textarea */}
              <div className="space-y-1.5">
                <Label htmlFor="demo-textarea">Textarea (Min height 80px)</Label>
                <Textarea
                  id="demo-textarea"
                  placeholder="Enter detailed post guidelines or instructions..."
                />
              </div>

              {/* Select */}
              <div className="space-y-1.5">
                <Label htmlFor="demo-select">Select Dropdown</Label>
                <Select defaultValue="utc">
                  <SelectTrigger id="demo-select">
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="utc">UTC (Coordinated Universal Time)</SelectItem>
                      <SelectItem value="est">EST (Eastern Standard Time)</SelectItem>
                      <SelectItem value="pst">PST (Pacific Standard Time)</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              {/* Checkboxes & Radio */}
              <div className="pt-2 space-y-4">
                <div className="flex items-center gap-2">
                  <Checkbox id="demo-check-default" />
                  <Label htmlFor="demo-check-default">Unchecked checkbox</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="demo-check-checked" defaultChecked />
                  <Label htmlFor="demo-check-checked">Checked checkbox</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="demo-check-disabled" disabled defaultChecked />
                  <Label htmlFor="demo-check-disabled" className="opacity-50">
                    Disabled checkbox
                  </Label>
                </div>

                <div className="space-y-2 pt-2">
                  <Label>Radio Group Selection</Label>
                  <RadioGroup defaultValue="daily">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="daily" id="radio-daily" />
                      <Label htmlFor="radio-daily">Every weekday morning</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="manual" id="radio-manual" />
                      <Label htmlFor="radio-manual">Manual trigger only</Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>
            </div>

            {/* Live react-hook-form with zod validation */}
            <div className="rounded-lg border border-border bg-card p-6">
              <span className="text-xs font-semibold text-muted-foreground block mb-4">
                Live React Hook Form with Zod
              </span>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onFormSubmit)}
                  className="space-y-4 form-container"
                >
                  <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Ada Lovelace" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input placeholder="ada@analytical.dev" {...field} />
                        </FormControl>
                        <FormDescription>
                          We send the approval link to this address daily.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Primary Role</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose role" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="founder">Founder / CEO</SelectItem>
                            <SelectItem value="engineer">Staff Engineer</SelectItem>
                            <SelectItem value="architect">Systems Architect</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tone Guidelines</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Direct, concise, analytical..."
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="agree"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start gap-2 space-y-0 pt-1">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-xs">
                            I verify that all published posts require explicit human approval.
                          </FormLabel>
                          <FormMessage />
                        </div>
                      </FormItem>
                    )}
                  />

                  <div className="pt-2 flex items-center gap-3">
                    <Button type="submit">Validate & Submit</Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => form.reset()}
                    >
                      Reset Form
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          </div>
        </Section>

        {/* 6. OVERLAYS: DIALOG, ALERT DIALOG, SHEET, DRAWER, DROPDOWN, TOOLTIP */}
        <Section
          title="6. Elevated Floating Surfaces"
          description="Only dialogs, popovers, dropdowns, sheets, and toasts receive floating elevation. All others remain flat."
        >
          <div className="rounded-lg border border-border bg-card p-6 space-y-6">
            <div className="flex flex-wrap items-center gap-4">
              {/* Modal Dialog */}
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline">Open Modal Dialog</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Configure Daily Pipeline</DialogTitle>
                    <DialogDescription>
                      Set generation schedule and automated draft triggers.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <div className="space-y-1">
                      <Label htmlFor="diag-time">Target Time</Label>
                      <Input id="diag-time" defaultValue="08:30" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="default">Save settings</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Alert Dialog (Destructive) */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">Confirm Deletion</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disconnect LinkedIn account?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will revoke AutoPulse publishing tokens. Scheduled posts will pause immediately.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Disconnect
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Slide-out Sheet */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline">Open Slide-out Sheet</Button>
                </SheetTrigger>
                <SheetContent side="right">
                  <SheetHeader>
                    <SheetTitle>Draft Details</SheetTitle>
                    <SheetDescription>
                      Inspect raw LinkedIn post payload and sources.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="py-4 space-y-3 text-sm">
                    <p className="text-muted-foreground">
                      Sources verified against Hacker News, ArXiv, and GitHub trending feeds.
                    </p>
                  </div>
                </SheetContent>
              </Sheet>

              {/* Bottom Drawer */}
              <Drawer>
                <DrawerTrigger asChild>
                  <Button variant="outline">Open Bottom Drawer</Button>
                </DrawerTrigger>
                <DrawerContent>
                  <DrawerHeader>
                    <DrawerTitle>Generation Inspector</DrawerTitle>
                    <DrawerDescription>
                      Real-time telemetry for today&apos;s pipeline run.
                    </DrawerDescription>
                  </DrawerHeader>
                  <div className="p-4 text-sm text-muted-foreground">
                    Telemetry: 4 candidate topics scraped, 1 approved by relevance gate.
                  </div>
                  <DrawerFooter>
                    <DrawerClose asChild>
                      <Button variant="outline">Close Inspector</Button>
                    </DrawerClose>
                  </DrawerFooter>
                </DrawerContent>
              </Drawer>

              {/* Dropdown Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">Dropdown Menu</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-48">
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem>Duplicate draft</DropdownMenuItem>
                    <DropdownMenuItem>Export as markdown</DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive">Delete draft</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Toaster triggers */}
              <Button
                variant="secondary"
                onClick={() => toast.success("Draft approved and queued for 09:00 UTC")}
              >
                Trigger Success Toast
              </Button>
              <Button
                variant="secondary"
                onClick={() => toast.error("LinkedIn API token expired")}
              >
                Trigger Error Toast
              </Button>
            </div>
          </div>
        </Section>

        {/* 7. STATUS BADGES & ALERTS */}
        <Section
          title="7. Badges, Status Indicators & Alerts"
          description="Color is strictly reserved for status communication. All post states map to verified accessible badges."
        >
          <div className="space-y-6 rounded-lg border border-border bg-card p-6">
            <div>
              <span className="text-xs font-semibold text-muted-foreground block mb-3">
                StatusBadge Component (Mapping Post States)
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status="draft" />
                <StatusBadge status="awaiting_approval" />
                <StatusBadge status="approved" />
                <StatusBadge status="publishing" />
                <StatusBadge status="published" />
                <StatusBadge status="rejected" />
                <StatusBadge status="failed" />
                <StatusBadge status="expired" />
              </div>
            </div>

            <div>
              <span className="text-xs font-semibold text-muted-foreground block mb-3">
                Core Badge Variants
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="default">default</Badge>
                <Badge variant="secondary">secondary</Badge>
                <Badge variant="outline">outline</Badge>
                <Badge variant="neutral">neutral</Badge>
                <Badge variant="draft">draft</Badge>
                <Badge variant="approved">approved</Badge>
                <Badge variant="published">published</Badge>
                <Badge variant="danger">danger</Badge>
                <Badge variant="destructive">destructive</Badge>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <span className="text-xs font-semibold text-muted-foreground block">
                System Alerts
              </span>
              <Alert>
                <InfoIcon className="size-4" />
                <AlertTitle>Review Queue Scheduled</AlertTitle>
                <AlertDescription>
                  Your morning approval link will be delivered at 08:30 UTC.
                </AlertDescription>
              </Alert>
              <Alert variant="destructive">
                <AlertCircleIcon className="size-4" />
                <AlertTitle>LinkedIn Connection Required</AlertTitle>
                <AlertDescription>
                  Please reconnect your LinkedIn profile in Connections to resume automated delivery.
                </AlertDescription>
              </Alert>
            </div>
          </div>
        </Section>

        {/* 8. DATA TABLE & NAVIGATION PATTERNS */}
        <Section
          title="8. Data Table, Tabs, Breadcrumbs & Accordion"
          description="TanStack Table with sorting, filtering, selection, and column toggle. Breadcrumbs and Accordions for deep documentation."
        >
          <div className="space-y-6">
            {/* Breadcrumb sample */}
            <div className="rounded-lg border border-border bg-card p-4">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href="/app">Overview</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink href="/app/posts">Posts</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Draft 1024</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>

            {/* Accordion sample */}
            <div className="rounded-lg border border-border bg-card p-4">
              <Accordion type="single" collapsible defaultValue="item-1">
                <AccordionItem value="item-1">
                  <AccordionTrigger>How does human-in-the-loop work?</AccordionTrigger>
                  <AccordionContent>
                    AutoPulse will never post to LinkedIn without your explicit approval. Every morning, you receive a direct approval link via email or app. One click approves or rejects the draft.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-2">
                  <AccordionTrigger>Can I edit the generated copy?</AccordionTrigger>
                  <AccordionContent>
                    Yes. On the review page, you can freely edit the headline, body text, or regenerated hashtags before confirming.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>

            {/* Tabs sample */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-4">
              <span className="text-xs font-semibold text-muted-foreground block">
                Tabs Navigation
              </span>
              <Tabs defaultValue="overview">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="metrics">Metrics</TabsTrigger>
                  <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="text-sm text-muted-foreground pt-2">
                  Overview tab content for daily pulse pipelines.
                </TabsContent>
                <TabsContent value="metrics" className="text-sm text-muted-foreground pt-2">
                  Metrics tab content for LinkedIn engagement.
                </TabsContent>
                <TabsContent value="settings" className="text-sm text-muted-foreground pt-2">
                  Settings tab content for delivery scheduling.
                </TabsContent>
              </Tabs>
            </div>

            {/* Single Level Card with Avatar, Separator and Pagination */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src="/avatar-placeholder.png" alt="Student Engineer" />
                    <AvatarFallback>SE</AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle>Single Level Card Pattern</CardTitle>
                    <CardDescription>Flat surface container without nested cards</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="pt-4 text-sm text-muted-foreground">
                Cards are allowed at one level only in the AutoPulse design system. They never contain nested cards.
              </CardContent>
              <CardFooter className="flex justify-between items-center">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious href="#design-guide" />
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationLink href="#design-guide" isActive>1</PaginationLink>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationLink href="#design-guide">2</PaginationLink>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext href="#design-guide" />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </CardFooter>
            </Card>

            {/* TanStack Data Table */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted-foreground block">
                TanStack Table Pattern (No Charts, No Drag Handles)
              </span>
              <DataTable data={sampleTableData} />
            </div>
          </div>
        </Section>

        {/* 9. CUSTOM AUTOPULSE COMPONENTS */}
        <Section
          title="9. Custom AutoPulse Components"
          description="Dedicated components built specifically for niche workflows: TagInput, ColorField, EmptyState, and ErrorState."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* TagInput */}
            <div className="rounded-lg border border-border bg-card p-6 space-y-3">
              <Label>TagInput (Interactive)</Label>
              <TagInput
                tags={demoTags}
                onChange={setDemoTags}
                placeholder="Type niche and press enter..."
              />
              <p className="text-xs text-muted-foreground">
                Active niches: {demoTags.join(", ") || "None"}
              </p>
            </div>

            {/* ColorField */}
            <div className="rounded-lg border border-border bg-card p-6 space-y-3">
              <Label>ColorField (Picker + Synchronized Hex Field)</Label>
              <ColorField
                value={selectedColor}
                onChange={setSelectedColor}
              />
              <p className="text-xs text-muted-foreground">
                Current brand hex: <span className="font-mono font-medium">{selectedColor}</span>
              </p>
            </div>

            {/* EmptyState */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted-foreground block">
                EmptyState (One sentence and one action)
              </span>
              <EmptyState
                message="No drafts currently waiting for review."
                action={
                  <Button size="sm" variant="outline">
                    Schedule generation run
                  </Button>
                }
              />
            </div>

            {/* ErrorState */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted-foreground block">
                ErrorState (Plain message and Try again button)
              </span>
              <ErrorState
                message="Failed to load LinkedIn connection telemetry from backend."
                onRetry={() => toast.info("Retrying connection fetch...")}
              />
            </div>

            {/* BrandPreviewCard */}
            <div className="rounded-lg border border-border bg-card p-6 space-y-3">
              <Label>BrandPreviewCard (Live Contrast Verification)</Label>
              <BrandPreviewCard
                brandName="AutoPulse Engineering"
                primaryHex={selectedColor}
                accentHex={["#", "B9E2DB"].join("")}
                showWarning={true}
              />
            </div>

            {/* PostThumbnail */}
            <div className="rounded-lg border border-border bg-card p-6 space-y-3">
              <Label>PostThumbnail (Authenticated Blob Loader)</Label>
              <div className="flex items-center gap-4">
                <PostThumbnail
                  postId="sample-demo"
                  width={240}
                  alt="Sample Post"
                  className="size-14 rounded-md border border-border"
                />
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p className="font-medium text-foreground">Authenticated blob fetcher</p>
                  <p>Fetches with Bearer header, displays fallback placeholder on error.</p>
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* 10. SKELETONS & LOADING */}
        <Section
          title="10. Skeletons & Loading States"
          description="Subtle pulsing placeholders with zero layout shifts."
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-lg border border-border bg-card p-6">
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-4 w-48" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
              <Skeleton className="h-16 w-full rounded-md" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </div>
        </Section>
      </main>
    </div>
  );
}

// Helper card component for color swatches
function ColorSwatchCard({
  name,
  cssVar,
  hex,
  className,
}: {
  name: string;
  cssVar: string;
  hex: string;
  className?: string;
}) {
  const displayHex = hex.startsWith("#") ? hex : ["#", hex].join("");
  return (
    <div className="rounded-md border border-border overflow-hidden bg-card text-xs flex flex-col">
      <div className={`h-12 w-full flex items-center justify-center font-mono ${className}`}>
        <span className="text-caption font-medium opacity-90">{displayHex}</span>
      </div>
      <div className="p-2 space-y-0.5">
        <p className="font-medium text-foreground truncate">{name}</p>
        <p className="text-muted-foreground font-mono text-caption truncate">{cssVar}</p>
      </div>
    </div>
  );
}

// Helper row for spacing scale display
function SpacingBar({
  step,
  px,
  className,
}: {
  step: string;
  px: string;
  className: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 text-muted-foreground">{step} ({px})</span>
      <div className={`h-3 rounded-xs bg-primary ${className}`} />
    </div>
  );
}
