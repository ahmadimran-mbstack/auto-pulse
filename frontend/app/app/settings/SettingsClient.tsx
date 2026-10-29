"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Profile } from "@/types/profile";
import { toast } from "sonner";
import {
  UserIcon,
  FileTextIcon,
  PaletteIcon,
  ClockIcon,
  ShieldAlertIcon,
  LogOutIcon,
  Loader2Icon,
} from "lucide-react";

import { useUser } from "@/components/providers/user-provider";
import {
  useProfileQuery,
  usePatchProfileMutation,
  useSlackStatusQuery,
  clearAllAppCaches,
} from "@/lib/queries";
import { deleteAccount, ApiClientError } from "@/lib/api";
import { authClient } from "@/lib/auth/client";
import { signOutAction } from "@/app/app/actions";
import { getTimezonesLazy } from "@/lib/timezones";
import { cn } from "@/lib/utils";

import { PageHeader } from "@/components/app/PageHeader";
import { ColorField } from "@/components/app/ColorField";
import { TagInput } from "@/components/app/TagInput";
import { BrandPreviewCard } from "@/components/app/BrandPreviewCard";
import { SettingsSkeleton } from "@/components/app/SettingsSkeleton";
import { PlatformLabel } from "@/components/app/PlatformLabel";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  profileFormSchema,
  contentFormSchema,
  brandFormSchema,
  scheduleFormSchema,
  changePasswordSchema,
  type ProfileFormValues,
  type ContentFormValues,
  type BrandFormValues,
  type ScheduleFormValues,
  type ChangePasswordValues,
} from "./settings-schemas";

type SettingsTab = "profile" | "content" | "brand" | "schedule" | "account";

const TABS: { id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "profile", label: "Profile", icon: UserIcon },
  { id: "content", label: "Content", icon: FileTextIcon },
  { id: "brand", label: "Brand", icon: PaletteIcon },
  { id: "schedule", label: "Schedule", icon: ClockIcon },
  { id: "account", label: "Account", icon: ShieldAlertIcon },
];

const DAY_OPTIONS = [
  { day: 0, label: "Mon", name: "Monday" },
  { day: 1, label: "Tue", name: "Tuesday" },
  { day: 2, label: "Wed", name: "Wednesday" },
  { day: 3, label: "Thu", name: "Thursday" },
  { day: 4, label: "Fri", name: "Friday" },
  { day: 5, label: "Sat", name: "Saturday" },
  { day: 6, label: "Sun", name: "Sunday" },
];

export function SettingsClient() {
  const router = useRouter();
  const { user, refreshUser } = useUser();
  const { data: profile, isLoading } = useProfileQuery(user.id);
  const patchProfileMutation = usePatchProfileMutation(user.id);

  const [activeTab, setActiveTab] = React.useState<SettingsTab>("profile");
  const [pendingTab, setPendingTab] = React.useState<SettingsTab | null>(null);
  const [showDiscardDialog, setShowDiscardDialog] = React.useState(false);

  // Tracks if the currently active tab has unsaved changes
  const [activeTabDirty, setActiveTabDirty] = React.useState(false);

  // Warn when user closes or reloads page with unsaved changes
  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (activeTabDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [activeTabDirty]);

  // Intercepts tab switching if there are unsaved changes
  const handleTabChange = (nextTab: SettingsTab) => {
    if (nextTab === activeTab) return;
    if (activeTabDirty) {
      setPendingTab(nextTab);
      setShowDiscardDialog(true);
    } else {
      setActiveTab(nextTab);
    }
  };

  const confirmDiscardTabChange = () => {
    if (pendingTab) {
      setActiveTab(pendingTab);
      setActiveTabDirty(false);
    }
    setShowDiscardDialog(false);
    setPendingTab(null);
  };

  if (isLoading || !profile) {
    return <SettingsSkeleton />;
  }

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-5xl mx-auto">
      <PageHeader
        title="Settings"
        description="Manage your profile, content preferences, brand styling, schedule, and account."
      />

      <div className="flex flex-col md:flex-row gap-8 items-start">
        {/* Desktop Vertical Sub-navigation */}
        <aside className="hidden md:block w-52 shrink-0">
          <nav aria-label="Settings sections" className="flex flex-col space-y-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors text-left w-full cursor-pointer ${
                    isActive
                      ? "bg-secondary text-foreground font-semibold"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className="size-4 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Mobile Horizontal Tabs List */}
        <div className="md:hidden w-full">
          <Tabs
            value={activeTab}
            onValueChange={(val) => handleTabChange(val as SettingsTab)}
            className="w-full"
          >
            <TabsList className="w-full grid grid-cols-5 h-auto p-1">
              {TABS.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="text-xs py-2 px-1 truncate"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Tab Content Panel */}
        <div className="flex-1 w-full max-w-2xl">
          {activeTab === "profile" && (
            <ProfileTabForm
              key={`profile-${profile.updated_at || profile.created_at}`}
              profile={profile}
              initialName={user.name || ""}
              onDirtyChange={setActiveTabDirty}
              refreshUser={refreshUser}
              patchProfileMutation={patchProfileMutation}
            />
          )}

          {activeTab === "content" && (
            <ContentTabForm
              key={`content-${profile.updated_at || profile.created_at}`}
              profile={profile}
              onDirtyChange={setActiveTabDirty}
              patchProfileMutation={patchProfileMutation}
            />
          )}

          {activeTab === "brand" && (
            <BrandTabForm
              key={`brand-${profile.updated_at || profile.created_at}`}
              profile={profile}
              onDirtyChange={setActiveTabDirty}
              patchProfileMutation={patchProfileMutation}
            />
          )}

          {activeTab === "schedule" && (
            <ScheduleTabForm
              key={`schedule-${profile.updated_at || profile.created_at}`}
              profile={profile}
              onDirtyChange={setActiveTabDirty}
              patchProfileMutation={patchProfileMutation}
            />
          )}

          {activeTab === "account" && (
            <AccountTabPanel
              email={user.email}
              router={router}
            />
          )}
        </div>
      </div>

      {/* Unsaved Changes Confirmation Dialog */}
      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes in this tab. If you leave now, your edits will not be saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingTab(null)}>
              Stay here
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscardTabChange}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Profile Tab Form
// ---------------------------------------------------------------------------
function ProfileTabForm({
  profile,
  initialName,
  onDirtyChange,
  refreshUser,
  patchProfileMutation,
}: {
  profile: Profile;
  initialName: string;
  onDirtyChange: (dirty: boolean) => void;
  refreshUser: () => Promise<void>;
  patchProfileMutation: ReturnType<typeof usePatchProfileMutation>;
}) {
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      display_name: profile.display_name || initialName || "",
      role_title: profile.role_title || "",
      industry: profile.industry || "",
    },
  });

  const isDirty = form.formState.isDirty;
  React.useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const onSubmit = async (values: ProfileFormValues) => {
    try {
      // Step 1: Update Neon Auth name if display name changed
      const newName = values.display_name?.trim() || "";
      if (newName && newName !== initialName) {
        const authRes = await authClient.updateUser({ name: newName });
        if (authRes?.error) {
          throw new Error(authRes.error.message || "Failed to update auth name");
        }
      }

      // Step 2: Patch backend profile
      await patchProfileMutation.mutateAsync({
        display_name: newName,
        role_title: values.role_title?.trim() || null,
        industry: values.industry?.trim() || null,
      });

      // Step 3: Refresh user session from Neon
      await refreshUser();

      toast.success("Profile saved.");
      form.reset(values);
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.fields) {
        Object.entries(err.fields).forEach(([f, msg]) => {
          form.setError(f as Path<ProfileFormValues>, { message: msg });
        });
      } else {
        const msg = err instanceof Error ? err.message : "Failed to save profile";
        toast.error(msg);
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          Your personal information and professional title used for LinkedIn drafts.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="display_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Ada Lovelace" {...field} />
                  </FormControl>
                  <FormDescription>
                    Your full name as shown across AutoPulse and your review alerts.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role_title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role or Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Staff Systems Engineer" {...field} />
                  </FormControl>
                  <FormDescription>
                    Your professional role helps AutoPulse frame your industry perspective.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="industry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Industry</FormLabel>
                  <FormControl>
                    <Input placeholder="Developer Infrastructure" {...field} />
                  </FormControl>
                  <FormDescription>
                    The broader industry or domain your niche belongs to.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="border-t border-border pt-4 flex justify-end">
            <Button
              type="submit"
              disabled={!isDirty || form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? (
                <>
                  <Loader2Icon className="size-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 2. Content Tab Form
// ---------------------------------------------------------------------------
function ContentTabForm({
  profile,
  onDirtyChange,
  patchProfileMutation,
}: {
  profile: Profile;
  onDirtyChange: (dirty: boolean) => void;
  patchProfileMutation: ReturnType<typeof usePatchProfileMutation>;
}) {
  const form = useForm<ContentFormValues>({
    resolver: zodResolver(contentFormSchema),
    defaultValues: {
      niche_description: profile.niche_description || "",
      audience: profile.audience || "",
      topics_include: Array.isArray(profile.topics_include) ? profile.topics_include : [],
      topics_avoid: Array.isArray(profile.topics_avoid) ? profile.topics_avoid : [],
      tone: profile.tone || "professional",
      voice_notes: profile.voice_notes || "",
      sample_posts: profile.sample_posts || "",
    },
  });

  const isDirty = form.formState.isDirty;
  React.useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const onSubmit = async (values: ContentFormValues) => {
    try {
      await patchProfileMutation.mutateAsync({
        niche_description: values.niche_description?.trim() || null,
        audience: values.audience?.trim() || null,
        topics_include: values.topics_include || [],
        topics_avoid: values.topics_avoid || [],
        tone: values.tone || null,
        voice_notes: values.voice_notes?.trim() || null,
        sample_posts: values.sample_posts?.trim() || null,
      });

      toast.success("Content preferences saved.");
      form.reset(values);
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.fields) {
        Object.entries(err.fields).forEach(([f, msg]) => {
          form.setError(f as Path<ContentFormValues>, { message: msg });
        });
      } else {
        const msg = err instanceof Error ? err.message : "Failed to save content preferences";
        toast.error(msg);
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Content Preferences</CardTitle>
        <CardDescription>
          Teach AutoPulse what you write about, who you write for, and the style of your posts.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="niche_description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Your Niche</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="High-performance backend systems, Postgres indexing, and database latency..."
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Describe the core topics you want your LinkedIn posts to explore each day.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="audience"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target Audience</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Senior backend engineers, database architects, and engineering leads"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Who should find these posts valuable and engaging?
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="topics_include"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Topics to Prioritize</FormLabel>
                  <FormControl>
                    <TagInput
                      tags={field.value}
                      onChange={field.onChange}
                      placeholder="Add topic and press enter..."
                    />
                  </FormControl>
                  <FormDescription>
                    Specific keywords or technical areas to prioritize in candidate topics.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="topics_avoid"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Topics to Avoid</FormLabel>
                  <FormControl>
                    <TagInput
                      tags={field.value}
                      onChange={field.onChange}
                      placeholder="Add topic to avoid..."
                    />
                  </FormControl>
                  <FormDescription>
                    Subjects or buzzwords that AutoPulse should never include in your drafts.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Voice and Tone</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value || "professional"}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select writing tone" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="friendly">Friendly</SelectItem>
                      <SelectItem value="direct">Direct</SelectItem>
                      <SelectItem value="educational">Educational</SelectItem>
                      <SelectItem value="inspiring">Inspiring</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    The primary tone used when generating draft copy and captions.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="voice_notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Style Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder="Use short sentences, avoid generic adjectives, highlight benchmark numbers..."
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Any specific stylistic rules or pet peeves you want AutoPulse to follow.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sample_posts"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sample Posts</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Paste one or two examples of past posts that performed well..."
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Examples of posts you have written that match your preferred cadence and style.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="border-t border-border pt-4 flex justify-end">
            <Button
              type="submit"
              disabled={!isDirty || form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? (
                <>
                  <Loader2Icon className="size-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3. Brand Tab Form
// ---------------------------------------------------------------------------
function BrandTabForm({
  profile,
  onDirtyChange,
  patchProfileMutation,
}: {
  profile: Profile;
  onDirtyChange: (dirty: boolean) => void;
  patchProfileMutation: ReturnType<typeof usePatchProfileMutation>;
}) {
  const form = useForm<BrandFormValues>({
    resolver: zodResolver(brandFormSchema),
    defaultValues: {
      brand_name: profile.brand_name || "",
      brand_primary_hex: profile.brand_primary_hex || ["#", "0B7F70"].join(""),
      brand_accent_hex: profile.brand_accent_hex || ["#", "B9E2DB"].join(""),
    },
  });

  const isDirty = form.formState.isDirty;
  React.useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const brandName = useWatch({ control: form.control, name: "brand_name" }) || "";
  const primaryHex = useWatch({ control: form.control, name: "brand_primary_hex" }) || ["#", "0B7F70"].join("");
  const accentHex = useWatch({ control: form.control, name: "brand_accent_hex" }) || ["#", "B9E2DB"].join("");

  const onSubmit = async (values: BrandFormValues) => {
    try {
      await patchProfileMutation.mutateAsync({
        brand_name: values.brand_name?.trim() || null,
        brand_primary_hex: values.brand_primary_hex || null,
        brand_accent_hex: values.brand_accent_hex || null,
      });

      toast.success("Brand styling saved.");
      form.reset(values);
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.fields) {
        Object.entries(err.fields).forEach(([f, msg]) => {
          form.setError(f as Path<BrandFormValues>, { message: msg });
        });
      } else {
        const msg = err instanceof Error ? err.message : "Failed to save brand styling";
        toast.error(msg);
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Brand Identity</CardTitle>
        <CardDescription>
          Customize the brand label and colors rendered on your LinkedIn post images.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="brand_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Brand Name</FormLabel>
                  <FormControl>
                    <Input placeholder="AutoPulse" {...field} />
                  </FormControl>
                  <FormDescription>
                    Displayed prominently on your daily generated post images.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="brand_primary_hex"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Primary Color</FormLabel>
                    <FormControl>
                      <ColorField
                        id="primary-color"
                        value={field.value || ""}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormDescription>
                      The dominant background color of your generated cards.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="brand_accent_hex"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Accent Color</FormLabel>
                    <FormControl>
                      <ColorField
                        id="accent-color"
                        value={field.value || ""}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormDescription>
                      Used for highlights, borders, and metric accents.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Live Visual Preview with WCAG Contrast Warning */}
            <div className="space-y-2 pt-2 border-t border-border">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Live Image Card Preview
              </Label>
              <BrandPreviewCard
                brandName={brandName}
                primaryHex={primaryHex}
                accentHex={accentHex}
                showWarning={true}
              />
            </div>
          </CardContent>
          <CardFooter className="border-t border-border pt-4 flex justify-end">
            <Button
              type="submit"
              disabled={!isDirty || form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? (
                <>
                  <Loader2Icon className="size-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 4. Schedule Tab Form
// ---------------------------------------------------------------------------
function ScheduleTabForm({
  profile,
  onDirtyChange,
  patchProfileMutation,
}: {
  profile: Profile;
  onDirtyChange: (dirty: boolean) => void;
  patchProfileMutation: ReturnType<typeof usePatchProfileMutation>;
}) {
  const router = useRouter();
  const { data: slackStatus } = useSlackStatusQuery();
  const isSlackConnected = slackStatus?.status === "connected";

  // Lazily compute timezone list only on settings schedule tab
  const timezones = React.useMemo(() => getTimezonesLazy(), []);
  const detectedTz = React.useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return null;
    }
  }, []);

  const defaultSlackEnabled = Boolean(
    profile.approval?.slack?.enabled ?? profile.slack_approval_enabled
  );
  const defaultEmailEnabled =
    profile.approval_method !== "slack" || !defaultSlackEnabled;
  const defaultMethod: "email" | "slack" | "both" =
    defaultEmailEnabled && defaultSlackEnabled
      ? "both"
      : defaultSlackEnabled
      ? "slack"
      : "email";

  const form = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues: {
      timezone: profile.timezone || "UTC",
      post_time: profile.post_time || "09:00",
      post_days: Array.isArray(profile.post_days) && profile.post_days.length > 0
        ? profile.post_days
        : [0, 1, 2, 3, 4],
      approval_method: defaultMethod,
      email_approval_enabled: defaultEmailEnabled,
      slack_approval_enabled: defaultSlackEnabled,
    },
  });

  const selectedTz = form.watch("timezone");
  const emailApprovalEnabled = form.watch("email_approval_enabled");
  const slackApprovalEnabled = form.watch("slack_approval_enabled");

  const currentTimeInSelectedTz = React.useMemo(() => {
    try {
      return new Date().toLocaleTimeString("en-US", {
        timeZone: selectedTz || "UTC",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return null;
    }
  }, [selectedTz]);

  const isDirty = form.formState.isDirty;
  React.useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const postDays = useWatch({ control: form.control, name: "post_days" }) || [];

  const toggleDay = (day: number) => {
    if (postDays.includes(day)) {
      form.setValue(
        "post_days",
        postDays.filter((d) => d !== day),
        { shouldDirty: true, shouldValidate: true }
      );
    } else {
      form.setValue(
        "post_days",
        [...postDays, day].sort((a, b) => a - b),
        { shouldDirty: true, shouldValidate: true }
      );
    }
  };

  const onSubmit = async (values: ScheduleFormValues) => {
    try {
      const emailOn = values.email_approval_enabled;
      const slackOn = values.slack_approval_enabled;
      const resolvedMethod = emailOn ? "email" : "slack";

      await patchProfileMutation.mutateAsync({
        timezone: values.timezone,
        post_time: values.post_time,
        post_days: values.post_days,
        approval_method: resolvedMethod,
        slack_approval_enabled: slackOn,
        approval: {
          slack_enabled: slackOn,
        },
      });

      toast.success("Schedule settings saved.");
      form.reset(values);
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.fields) {
        Object.entries(err.fields).forEach(([f, msg]) => {
          form.setError(f as Path<ScheduleFormValues>, { message: msg });
        });
      } else {
        const msg = err instanceof Error ? err.message : "Failed to save schedule";
        toast.error(msg);
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Publishing Schedule</CardTitle>
        <CardDescription>
          Configure the days and time of day AutoPulse generates drafts for your review.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="timezone"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <FormLabel>Timezone</FormLabel>
                    {currentTimeInSelectedTz && (
                      <span className="text-xs text-muted-foreground font-mono">
                        Current time: <span className="font-semibold text-foreground">{currentTimeInSelectedTz}</span>
                      </span>
                    )}
                  </div>
                  {detectedTz && detectedTz !== selectedTz && (
                    <div className="flex items-center gap-2 p-2 rounded-md bg-muted/60 border border-border text-xs">
                      <span className="text-muted-foreground">Detected device timezone:</span>
                      <button
                        type="button"
                        onClick={() => {
                          form.setValue("timezone", detectedTz, { shouldDirty: true });
                        }}
                        className="font-medium text-primary hover:underline cursor-pointer"
                      >
                        Switch to {detectedTz}
                      </button>
                    </div>
                  )}
                  <Select onValueChange={field.onChange} value={field.value || "UTC"}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="max-h-60">
                      {timezones.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    All review links and automated draft generation times use this timezone.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="post_time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Draft Delivery Time</FormLabel>
                  <FormControl>
                    <Input
                      type="time"
                      className="max-w-xs font-mono tabular-nums"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    The time of day your morning draft will be generated and waiting for approval.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Publishing Days Checklist */}
            <div className="space-y-2 pt-1">
              <Label>Active Days of the Week</Label>
              <p className="text-caption text-muted-foreground">
                Select which days of the week you want posts prepared.
              </p>
              <div
                role="group"
                aria-label="Active posting days"
                className="flex flex-wrap gap-2 pt-1"
              >
                {DAY_OPTIONS.map((opt) => {
                  const isSelected = postDays.includes(opt.day);
                  return (
                    <button
                      key={opt.day}
                      type="button"
                      onClick={() => toggleDay(opt.day)}
                      className={`inline-flex items-center justify-center px-4 py-2 rounded-md border text-caption font-medium cursor-pointer transition-colors select-none ${
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-foreground border-border hover:bg-secondary/40"
                      }`}
                      aria-pressed={isSelected}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {form.formState.errors.post_days && (
                <p className="text-xs text-destructive font-medium pt-1">
                  {form.formState.errors.post_days.message}
                </p>
              )}
            </div>

            {/* Approval Notification Method */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label>Approval Notification Method</Label>
                <span className="text-xs text-muted-foreground">
                  Select your notification channels
                </span>
              </div>

              <div className="space-y-3 pt-1">
                {/* 1. Email Approval Option Card */}
                <div
                  onClick={() => {
                    const nextVal = !emailApprovalEnabled;
                    if (!nextVal && !slackApprovalEnabled) {
                      toast.error("At least one approval method must remain active.");
                      return;
                    }
                    form.setValue("email_approval_enabled", nextVal, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                    const nextMethod: "email" | "slack" | "both" =
                      nextVal && slackApprovalEnabled
                        ? "both"
                        : nextVal
                        ? "email"
                        : "slack";
                    form.setValue("approval_method", nextMethod, {
                      shouldDirty: true,
                    });
                  }}
                  className={cn(
                    "p-3.5 rounded-lg border transition-all cursor-pointer flex items-start gap-3.5 select-none",
                    emailApprovalEnabled
                      ? "border-primary/50 bg-primary/5 shadow-xs"
                      : "border-border bg-card/60 hover:bg-muted/40"
                  )}
                >
                  <Checkbox
                    id="sched-approval-email"
                    checked={emailApprovalEnabled}
                    onCheckedChange={(checked) => {
                      const nextVal = Boolean(checked);
                      if (!nextVal && !slackApprovalEnabled) {
                        toast.error("At least one approval method must remain active.");
                        return;
                      }
                      form.setValue("email_approval_enabled", nextVal, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                      const nextMethod: "email" | "slack" | "both" =
                        nextVal && slackApprovalEnabled
                          ? "both"
                          : nextVal
                          ? "email"
                          : "slack";
                      form.setValue("approval_method", nextMethod, {
                        shouldDirty: true,
                      });
                    }}
                    className="mt-0.5"
                    aria-label="Email approval notifications"
                  />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <PlatformLabel platform="email" size="sm" />
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs font-normal",
                          emailApprovalEnabled
                            ? "border-primary/30 text-primary bg-primary/10"
                            : "text-muted-foreground"
                        )}
                      >
                        {emailApprovalEnabled ? "Active" : "Disabled"}
                      </Badge>
                    </div>
                    <p className="text-caption text-muted-foreground leading-relaxed">
                      You receive an email notification each morning with an instant one-click approval link.
                    </p>
                  </div>
                </div>

                {/* 2. Slack Approval Option Card */}
                <div
                  onClick={() => {
                    if (!isSlackConnected) {
                      router.push("/app/connections");
                      return;
                    }
                    const nextVal = !slackApprovalEnabled;
                    if (!nextVal && !emailApprovalEnabled) {
                      toast.error("At least one approval method must remain active.");
                      return;
                    }
                    form.setValue("slack_approval_enabled", nextVal, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                    const nextMethod: "email" | "slack" | "both" =
                      emailApprovalEnabled && nextVal
                        ? "both"
                        : nextVal
                        ? "slack"
                        : "email";
                    form.setValue("approval_method", nextMethod, {
                      shouldDirty: true,
                    });
                  }}
                  className={cn(
                    "p-3.5 rounded-lg border transition-all cursor-pointer flex items-start gap-3.5 select-none",
                    slackApprovalEnabled
                      ? "border-primary/50 bg-primary/5 shadow-xs"
                      : "border-border bg-card/60 hover:bg-muted/40"
                  )}
                >
                  <Checkbox
                    id="sched-approval-slack"
                    checked={slackApprovalEnabled}
                    disabled={!isSlackConnected}
                    onCheckedChange={(checked) => {
                      if (!isSlackConnected) return;
                      const nextVal = Boolean(checked);
                      if (!nextVal && !emailApprovalEnabled) {
                        toast.error("At least one approval method must remain active.");
                        return;
                      }
                      form.setValue("slack_approval_enabled", nextVal, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                      const nextMethod: "email" | "slack" | "both" =
                        emailApprovalEnabled && nextVal
                          ? "both"
                          : nextVal
                          ? "slack"
                          : "email";
                      form.setValue("approval_method", nextMethod, {
                        shouldDirty: true,
                      });
                    }}
                    className="mt-0.5"
                    aria-label="Slack approval notifications"
                  />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <PlatformLabel platform="slack" size="sm" />
                      </div>
                      {isSlackConnected ? (
                        <div className="flex items-center gap-1.5">
                          {slackStatus?.team_name && (
                            <span className="text-xs text-muted-foreground font-medium hidden sm:inline">
                              {slackStatus.team_name}
                            </span>
                          )}
                          <Badge
                            variant="outline"
                            className="border-status-success-fg/30 bg-status-success-bg text-status-success-fg text-xs font-normal"
                          >
                            Connected
                          </Badge>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs text-muted-foreground font-normal">
                            Not connected
                          </Badge>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs px-2.5 gap-1.5"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push("/app/connections");
                            }}
                          >
                            <PlatformLabel platform="slack" showName={false} size="xs" />
                            <span>Connect Slack</span>
                          </Button>
                        </div>
                      )}
                    </div>
                    <p className="text-caption text-muted-foreground leading-relaxed">
                      Receive an interactive direct message in your Slack workspace with instant Approve and Reject buttons.
                    </p>
                  </div>
                </div>
              </div>

              {form.formState.errors.approval_method && (
                <p className="text-xs text-destructive font-medium pt-1">
                  {form.formState.errors.approval_method.message}
                </p>
              )}
            </div>

            {/* Required informative note from design rules */}
            <p className="text-xs text-muted-foreground pt-1">
              Changes apply to future posts. Drafts already created keep their time.
            </p>
          </CardContent>
          <CardFooter className="border-t border-border pt-4 flex justify-end">
            <Button
              type="submit"
              disabled={!isDirty || form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? (
                <>
                  <Loader2Icon className="size-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 5. Account Tab Panel
// ---------------------------------------------------------------------------
function AccountTabPanel({
  email,
  router,
}: {
  email: string;
  router: ReturnType<typeof useRouter>;
}) {
  const [deleteConfirmText, setDeleteConfirmText] = React.useState("");
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Change Password Form using Neon Auth changePassword
  const passwordForm = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      revokeOtherSessions: true,
    },
  });

  const onPasswordSubmit = async (values: ChangePasswordValues) => {
    try {
      // Calls Neon Auth changePassword method
      // Reference: https://neon.com/docs/auth/guides/user-management.md
      const authRes = await authClient.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        revokeOtherSessions: values.revokeOtherSessions,
      });

      if (authRes?.error) {
        throw new Error(authRes.error.message || "Failed to update password");
      }

      toast.success("Password changed successfully.");
      passwordForm.reset({
        currentPassword: "",
        newPassword: "",
        revokeOtherSessions: true,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to change password";
      toast.error(msg);
    }
  };

  // Handles account deletion per strict specification:
  // 1. DELETE /account first
  // 2. Neon Auth delete user method if available
  // 3. Clear cache and redirect to landing page
  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim() !== "DELETE") return;
    setIsDeleting(true);

    try {
      // Step 1: Call DELETE /account on AutoPulse backend
      await deleteAccount("DELETE");

      // Step 2: Check and invoke Neon Auth delete method if available
      let neonAuthDeleted = false;
      try {
        const clientAny = authClient as unknown as Record<string, unknown>;
        if (typeof clientAny.deleteUser === "function") {
          await (clientAny.deleteUser as () => Promise<unknown>)();
          neonAuthDeleted = true;
        }
      } catch (authErr) {
        console.warn("Neon auth client deleteUser failed or unavailable:", authErr);
      }

      // Clear memory query cache and token cache
      clearAllAppCaches();

      if (!neonAuthDeleted) {
        // If client-side deleteUser is missing or failed, do NOT pretend it worked
        toast.info(
          "Your account data was removed. Your sign-in record will be removed by our team.",
          { duration: 8000 }
        );
      } else {
        toast.success("Your account was deleted.");
      }

      setShowDeleteDialog(false);
      router.push("/");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete account";
      toast.error(msg);
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Read-only User Details */}
      <Card>
        <CardHeader>
          <CardTitle>Account Details</CardTitle>
          <CardDescription>
            Your login identity and authenticated session settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">Email Address</Label>
            <p className="text-body font-mono font-medium text-foreground">{email}</p>
            <p className="text-caption text-muted-foreground">
              Your email is managed by your authentication provider.
            </p>
          </div>
        </CardContent>
        <CardFooter className="border-t border-border pt-4 flex justify-between items-center">
          <span className="text-caption text-muted-foreground">
            Sign out of your active browser session
          </span>
          <form
            action={signOutAction}
            onSubmit={() => {
              clearAllAppCaches();
            }}
          >
            <Button variant="outline" size="sm" type="submit" className="gap-2">
              <LogOutIcon className="size-4" />
              <span>Sign out</span>
            </Button>
          </form>
        </CardFooter>
      </Card>

      {/* Change Password Form */}
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>
            Update your account password. Requires your current password for verification.
          </CardDescription>
        </CardHeader>
        <Form {...passwordForm}>
          <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}>
            <CardContent className="space-y-4">
              <FormField
                control={passwordForm.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••••••"
                        autoComplete="current-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={passwordForm.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••••••"
                        autoComplete="new-password"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Must be at least 8 characters and at most 128 characters.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={passwordForm.control}
                name="revokeOtherSessions"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start gap-2 space-y-0 pt-1">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-0.5 leading-none">
                      <FormLabel className="text-body font-normal cursor-pointer">
                        Sign out of other devices
                      </FormLabel>
                      <FormDescription>
                        Revoke all active sessions on other browsers immediately.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter className="border-t border-border pt-4 flex justify-end">
              <Button
                type="submit"
                disabled={
                  !passwordForm.formState.isDirty ||
                  passwordForm.formState.isSubmitting
                }
              >
                {passwordForm.formState.isSubmitting ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin mr-2" />
                    Updating...
                  </>
                ) : (
                  "Change password"
                )}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>

      {/* Danger Zone: Delete Account */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Permanently delete your AutoPulse account and remove your stored personal data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-foreground">
            Once you delete your account, your profile, linked accounts, and post drafts will be permanently removed. This action cannot be reversed.
          </p>
        </CardContent>
        <CardFooter className="border-t border-border pt-4 flex justify-end">
          <Button
            variant="destructive"
            onClick={() => {
              setDeleteConfirmText("");
              setShowDeleteDialog(true);
            }}
          >
            Delete account...
          </Button>
        </CardFooter>
      </Card>

      {/* Delete Account Confirmation AlertDialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-left">
              <span>
                This action will delete your profile, connections, drafts, and posts in AutoPulse. Posts already published to LinkedIn will stay on LinkedIn.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 py-2 text-left">
            <Label htmlFor="delete-confirm-input" className="text-xs text-foreground font-medium">
              To confirm deletion, type <span className="font-mono font-semibold text-destructive">DELETE</span> below:
            </Label>
            <Input
              id="delete-confirm-input"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="font-mono"
              autoFocus
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isDeleting}
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteConfirmText.trim() !== "DELETE" || isDeleting}
              onClick={handleDeleteAccount}
            >
              {isDeleting ? (
                <>
                  <Loader2Icon className="size-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                "Delete account"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
