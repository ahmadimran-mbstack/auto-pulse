"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Brain,
  Building2,
  FileText,
  FlaskConical,
  History,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";

import { Tabs, TabsContent } from "@/components/ui/tabs";
import { AppTabsList, AppTabsTrigger } from "@/components/app/AppTabs";
import { PageContainer } from "@/components/app/PageContainer";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  activateCustomizationVersion,
  addBusinessUrl,
  customizationKeys,
  deleteCustomizationDocument,
  getCompiledContext,
  getCustomizationOverview,
  getDocumentsPollingInterval,
  listCustomizationDocuments,
  pasteCustomizationDocument,
  patchContextOverrides,
  patchCustomizationDocument,
  patchCustomizationFact,
  patchPostSample,
  reprocessCustomizationDocument,
  triggerCustomizationCompile,
  updateCustomizationSettings,
  uploadCustomizationDocumentWithProgress,
} from "@/lib/customization";
import type { ActiveUploadItem } from "@/components/app/FileDropzone";
import type { DocumentKind, DocumentSummary } from "@/types/customization";
import { cn } from "@/lib/utils";
import { useUser } from "@/components/providers/user-provider";
import { useEntitlements } from "@/lib/queries";
import { LockedFeatureCard } from "@/components/app/LockedFeatureCard";
import { LearnedProfilePanel } from "./components/LearnedProfilePanel";
import { PlaybooksSection } from "./components/PlaybooksSection";
import { BusinessSection } from "./components/BusinessSection";
import { PreviousPostsSection } from "./components/PreviousPostsSection";
import { InstructionsSection } from "./components/InstructionsSection";
import { DocumentDetailSheet } from "./components/DocumentDetailSheet";
import { VersionHistorySheet } from "./components/VersionHistorySheet";

type CustomizeTab = "learned" | "playbooks" | "business" | "posts" | "instructions";

const TABS: { id: CustomizeTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "learned", label: "Learned", icon: Brain },
  { id: "playbooks", label: "Playbooks", icon: BookOpen },
  { id: "business", label: "Business", icon: Building2 },
  { id: "posts", label: "Previous posts", icon: FileText },
  { id: "instructions", label: "Instructions", icon: SlidersHorizontal },
];

function formatUpdatedTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function CustomizeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const { data: ent } = useEntitlements(user?.id);
  const docsLocked = Boolean(ent && ent.plan_id !== "internal" && (ent.features.docs_token_limit ?? 0) === 0);

  const rawTab = searchParams.get("tab") as CustomizeTab | null;
  const activeTab: CustomizeTab =
    rawTab && TABS.some((t) => t.id === rawTab) ? rawTab : "learned";

  const [inspectDocId, setInspectDocId] = React.useState<string | null>(null);
  const lastInspectTriggerRef = React.useRef<HTMLElement | null>(null);
  const handleInspectDoc = React.useCallback((doc: DocumentSummary) => {
    lastInspectTriggerRef.current =
      typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
    setInspectDocId(doc.id);
  }, []);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [activeUploadsByKind, setActiveUploadsByKind] = React.useState<
    Record<DocumentKind, ActiveUploadItem[]>
  >({
    playbook: [],
    business: [],
    previous_posts: [],
  });

  const is404Error = (err: unknown): boolean =>
    typeof err === "object" && err !== null && "status" in err && (err as { status?: number }).status === 404;

  const overviewQuery = useQuery({
    queryKey: customizationKeys.overview(),
    queryFn: getCustomizationOverview,
    retry: (count, err) => !is404Error(err) && count < 2,
  });

  const docsQuery = useQuery({
    queryKey: customizationKeys.documents(),
    queryFn: () => listCustomizationDocuments(),
    enabled: !overviewQuery.isError,
    refetchInterval: (q) => getDocumentsPollingInterval(q.state.data),
  });

  const contextQuery = useQuery({
    queryKey: customizationKeys.context(),
    queryFn: getCompiledContext,
    enabled: !overviewQuery.isError,
    refetchInterval: (q) => (q.state.data?.compile_pending ? 2000 : false),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: customizationKeys.all });
  };

  const uploadMutation = useMutation({
    mutationFn: async ({ files, kind }: { files: File[]; kind: DocumentKind }) => {
      for (const file of files) {
        const uploadId = `${file.name}-${Date.now()}-${Math.random()}`;
        setActiveUploadsByKind((prev) => ({
          ...prev,
          [kind]: [...prev[kind], { id: uploadId, name: file.name, progress: 0 }],
        }));
        try {
          const res = await uploadCustomizationDocumentWithProgress(file, kind, (pct) => {
            setActiveUploadsByKind((prev) => ({
              ...prev,
              [kind]: prev[kind].map((item) =>
                item.id === uploadId ? { ...item, progress: pct } : item
              ),
            }));
          });
          if (res.duplicate) {
            toast.info(`${file.name} was already uploaded.`);
          } else {
            toast.success(`Uploaded ${file.name}. Reading & learning...`);
          }
        } finally {
          setActiveUploadsByKind((prev) => ({
            ...prev,
            [kind]: prev[kind].filter((item) => item.id !== uploadId),
          }));
        }
      }
    },
    onSuccess: invalidateAll,
    onError: (err: Error) => toast.error(err.message || "Upload failed."),
  });

  const pasteMutation = useMutation({
    mutationFn: pasteCustomizationDocument,
    onSuccess: (res) => {
      toast.success(res.duplicate ? "Already saved." : "Saved posts. Extracting voice...");
      invalidateAll();
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save posts."),
  });

  const urlMutation = useMutation({
    mutationFn: addBusinessUrl,
    onSuccess: (res) => {
      toast.success(res.duplicate ? "URL already added." : "Added URL. Fetching content...");
      invalidateAll();
    },
    onError: (err: Error) => toast.error(err.message || "Failed to add URL."),
  });

  const toggleDocMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      patchCustomizationDocument(id, { enabled }),
    onSuccess: invalidateAll,
    onError: (err: Error) => toast.error(err.message || "Update failed."),
  });

  const reprocessMutation = useMutation({
    mutationFn: (id: string) => reprocessCustomizationDocument(id),
    onSuccess: () => {
      toast.success("Reprocessing queued.");
      invalidateAll();
    },
    onError: (err: Error) => toast.error(err.message || "Reprocess failed."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCustomizationDocument(id),
    onSuccess: () => {
      toast.success("Document deleted.");
      invalidateAll();
    },
    onError: (err: Error) => toast.error(err.message || "Delete failed."),
  });

  const settingsMutation = useMutation({
    mutationFn: updateCustomizationSettings,
    onSuccess: () => {
      toast.success("Customization settings saved.");
      invalidateAll();
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save settings."),
  });

  const overridesMutation = useMutation({
    mutationFn: patchContextOverrides,
    onSuccess: () => {
      toast.success("Updated learned profile. Rebuilding...");
      invalidateAll();
    },
    onError: (err: Error) => toast.error(err.message || "Failed to update overrides."),
  });

  const compileMutation = useMutation({
    mutationFn: triggerCustomizationCompile,
    onSuccess: () => {
      toast.success("Rebuild checked.");
      invalidateAll();
    },
    onError: (err: Error) => toast.error(err.message || "Rebuild failed."),
  });

  const sampleMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { pinned?: boolean; excluded?: boolean } }) =>
      patchPostSample(id, payload),
    onSuccess: () => {
      if (inspectDocId) {
        queryClient.invalidateQueries({ queryKey: customizationKeys.document(inspectDocId) });
      }
      invalidateAll();
    },
    onError: (err: Error) => toast.error(err.message || "Failed to update sample."),
  });

  const factMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { is_core?: boolean; removed?: boolean } }) =>
      patchCustomizationFact(id, payload),
    onSuccess: () => {
      if (inspectDocId) {
        queryClient.invalidateQueries({ queryKey: customizationKeys.document(inspectDocId) });
      }
      invalidateAll();
    },
    onError: (err: Error) => toast.error(err.message || "Failed to update item."),
  });

  const activateVersionMutation = useMutation({
    mutationFn: activateCustomizationVersion,
    onSuccess: () => {
      toast.success("Version activated.");
      setHistoryOpen(false);
      invalidateAll();
    },
    onError: (err: Error) => toast.error(err.message || "Failed to activate version."),
  });

  if (overviewQuery.isError && is404Error(overviewQuery.error)) {
    return (
      <PageContainer>
        <Card className="border border-border bg-card shadow-none rounded-lg">
          <CardHeader className="p-4 sm:p-5">
            <CardTitle>Customization is not enabled</CardTitle>
            <CardDescription>
              Enable <code className="text-xs bg-muted px-1 py-0.5 rounded">CUSTOMIZATION_ENABLED=true</code> in the backend environment to use playbooks, business context, and voice learning.
            </CardDescription>
          </CardHeader>
        </Card>
      </PageContainer>
    );
  }

  const docs = docsQuery.data ?? [];
  const playbooks = docs.filter((d) => d.kind === "playbook");
  const businessDocs = docs.filter((d) => d.kind === "business");
  const prevPostsDocs = docs.filter((d) => d.kind === "previous_posts");
  const overview = overviewQuery.data;
  const settings = overview?.settings;
  const ctxData = contextQuery.data;
  const activeSourcesCount = ctxData?.compiled?.sources?.length ?? 0;
  const isRebuilding = Boolean(compileMutation.isPending || ctxData?.compile_pending);

  const handleTabChange = (val: string) => {
    router.replace(`/app/customize?tab=${val}`, { scroll: false });
  };

  return (
    <PageContainer>
      <PageHeader
        title="Customize"
        description="Upload your LinkedIn playbooks, business details, previous posts, and instructions. Every generated post uses them."
        meta={
          ctxData ? (
            <>
              <span className="inline-flex items-center rounded-full border border-status-neutral-border bg-status-neutral-bg px-2.5 py-0.5 text-xs font-medium text-status-neutral-fg tabular-nums">
                v{ctxData.version}
              </span>
              <span className="tabular-nums">
                {activeSourcesCount} active {activeSourcesCount === 1 ? "source" : "sources"}
              </span>
              {ctxData.updated_at && (
                <span className="tabular-nums">
                  · Updated {formatUpdatedTime(ctxData.updated_at)}
                </span>
              )}
              <StatusBadge status={isRebuilding ? "rebuilding" : "up_to_date"} />
            </>
          ) : undefined
        }
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setHistoryOpen(true)}
              className="gap-1.5"
            >
              <History className="size-4 stroke-[1.75]" />
              <span>Version history</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => compileMutation.mutate()}
              disabled={isRebuilding}
              className="gap-1.5"
            >
              <RefreshCw
                className={cn(
                  "size-4 stroke-[1.75]",
                  isRebuilding && "animate-spin motion-reduce:animate-none"
                )}
              />
              <span>Rebuild</span>
            </Button>
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/app/playground">
                <FlaskConical className="size-4 stroke-[1.75]" />
                <span>Test in Playground</span>
              </Link>
            </Button>
          </>
        }
      />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <AppTabsList>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <AppTabsTrigger key={tab.id} value={tab.id}>
                <Icon className="size-4 stroke-[1.75]" />
                <span>{tab.label}</span>
              </AppTabsTrigger>
            );
          })}
        </AppTabsList>

        <TabsContent value="learned">
          <LearnedProfilePanel
            context={ctxData}
            samplesCount={overview?.quota.samples_used ?? 0}
            customInstructions={settings?.custom_instructions ?? ""}
            isLoading={contextQuery.isLoading}
            onSaveVoiceOverride={(summary) =>
              overridesMutation.mutate({ voice_summary_override: summary })
            }
            onRemoveFact={(factId) => {
              const current = ctxData?.compiled?.guidance?.business_facts ?? [];
              const remaining = current.filter((f) => f.id !== factId);
              overridesMutation.mutate({ removed_fact_ids: [factId] });
              if (remaining.length === 0) toast.info("Fact removed.");
            }}
            onGoToPreviousPosts={() => handleTabChange("posts")}
            onGoToInstructions={() => handleTabChange("instructions")}
          />
        </TabsContent>

        <TabsContent value="playbooks">
          {docsLocked ? (
            <LockedFeatureCard
              title="Playbooks"
              description="Upload your LinkedIn playbooks and frameworks on Pro or Business."
              requiredPlan="Pro"
            />
          ) : (
            <PlaybooksSection
              docs={playbooks}
              mode={settings?.default_playbook_mode ?? "merge"}
              onModeChange={(mode) => settingsMutation.mutate({ default_playbook_mode: mode })}
              onUpload={(files) => uploadMutation.mutate({ files, kind: "playbook" })}
              onToggleEnabled={(doc: DocumentSummary, enabled: boolean) =>
                toggleDocMutation.mutate({ id: doc.id, enabled })
              }
              onInspect={handleInspectDoc}
              onReprocess={(doc) => reprocessMutation.mutate(doc.id)}
              onDelete={(doc) => deleteMutation.mutate(doc.id)}
              isUploading={uploadMutation.isPending}
              activeUploads={activeUploadsByKind.playbook}
            />
          )}
        </TabsContent>

        <TabsContent value="business">
          {docsLocked ? (
            <LockedFeatureCard
              title="Business documents"
              description="Upload product briefs, case studies, and company facts on Pro or Business."
              requiredPlan="Pro"
            />
          ) : (
            <BusinessSection
              docs={businessDocs}
              businessMention={settings?.business_mention ?? "natural"}
              onBusinessMentionChange={(val) =>
                settingsMutation.mutate({ business_mention: val })
              }
              onAddUrl={async (vals) => {
                await urlMutation.mutateAsync(vals);
              }}
              onUpload={(files) => uploadMutation.mutate({ files, kind: "business" })}
              onToggleEnabled={(doc, enabled) =>
                toggleDocMutation.mutate({ id: doc.id, enabled })
              }
              onInspect={handleInspectDoc}
              onReprocess={(doc) => reprocessMutation.mutate(doc.id)}
              onDelete={(doc) => deleteMutation.mutate(doc.id)}
              isUploading={uploadMutation.isPending}
              activeUploads={activeUploadsByKind.business}
            />
          )}
        </TabsContent>

        <TabsContent value="posts">
          {docsLocked ? (
            <LockedFeatureCard
              title="Previous posts"
              description="Upload or paste your past posts for voice matching on Pro or Business."
              requiredPlan="Pro"
            />
          ) : (
            <PreviousPostsSection
              docs={prevPostsDocs}
              samplesCount={overview?.quota.samples_used ?? 0}
              useForVoice={settings?.use_previous_posts_for_voice ?? true}
              onUseForVoiceChange={(val) =>
                settingsMutation.mutate({ use_previous_posts_for_voice: val })
              }
              onUpload={(files) => uploadMutation.mutate({ files, kind: "previous_posts" })}
              onPaste={async (vals) => {
                await pasteMutation.mutateAsync({ ...vals, kind: "previous_posts" });
              }}
              onToggleEnabled={(doc, enabled) =>
                toggleDocMutation.mutate({ id: doc.id, enabled })
              }
              onInspect={handleInspectDoc}
              onReprocess={(doc) => reprocessMutation.mutate(doc.id)}
              onDelete={(doc) => deleteMutation.mutate(doc.id)}
              isUploading={uploadMutation.isPending}
              activeUploads={activeUploadsByKind.previous_posts}
            />
          )}
        </TabsContent>

        <TabsContent value="instructions">
          <InstructionsSection
            initialInstructions={settings?.custom_instructions ?? ""}
            mode={settings?.default_playbook_mode ?? "merge"}
            onModeChange={(mode) => settingsMutation.mutate({ default_playbook_mode: mode })}
            detectedConstraints={settings?.detected_constraints ?? []}
            instructionWarnings={settings?.instruction_warnings ?? []}
            onSave={async (instructions) => {
              await settingsMutation.mutateAsync({ custom_instructions: instructions });
            }}
          />
        </TabsContent>
      </Tabs>

      <DocumentDetailSheet
        docId={inspectDocId}
        open={Boolean(inspectDocId)}
        onOpenChange={(open) => {
          if (!open) setInspectDocId(null);
        }}
        onToggleEnabled={(doc, enabled) =>
          toggleDocMutation.mutate({ id: doc.id, enabled })
        }
        onReprocess={(doc) => reprocessMutation.mutate(doc.id)}
        onToggleFactCore={(id, is_core) =>
          factMutation.mutate({ id, payload: { is_core } })
        }
        onToggleFactRemoved={(id, removed) =>
          factMutation.mutate({ id, payload: { removed } })
        }
        onToggleSamplePin={(id, pinned) => sampleMutation.mutate({ id, payload: { pinned } })}
        onToggleSampleExclude={(id, excluded) =>
          sampleMutation.mutate({ id, payload: { excluded } })
        }
        onAddBusinessDocument={() => {
          setInspectDocId(null);
          handleTabChange("business");
          setTimeout(() => {
            document.getElementById("business-documents-section")?.scrollIntoView({ behavior: "smooth" });
          }, 150);
        }}
        onReturnFocus={() => {
          lastInspectTriggerRef.current?.focus();
          lastInspectTriggerRef.current = null;
        }}
      />

      <VersionHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onActivateVersion={(id) => activateVersionMutation.mutate(id)}
      />
    </PageContainer>
  );
}
