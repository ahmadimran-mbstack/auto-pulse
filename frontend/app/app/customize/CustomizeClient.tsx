"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpenIcon,
  Building2Icon,
  FileTextIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  patchPostSample,
  reprocessCustomizationDocument,
  triggerCustomizationCompile,
  updateCustomizationSettings,
  uploadCustomizationDocumentWithProgress,
} from "@/lib/customization";
import type { ActiveUploadItem } from "@/components/app/FileDropzone";
import type { DocumentKind, DocumentSummary } from "@/types/customization";
import { LearnedProfilePanel } from "./components/LearnedProfilePanel";
import { PlaybooksSection } from "./components/PlaybooksSection";
import { BusinessSection } from "./components/BusinessSection";
import { PreviousPostsSection } from "./components/PreviousPostsSection";
import { InstructionsSection } from "./components/InstructionsSection";
import { DocumentDetailSheet } from "./components/DocumentDetailSheet";
import { VersionHistorySheet } from "./components/VersionHistorySheet";

type CustomizeTab = "learned" | "playbooks" | "business" | "posts" | "instructions";

const TABS: { id: CustomizeTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "learned", label: "Learned", icon: SparklesIcon },
  { id: "playbooks", label: "Playbooks", icon: BookOpenIcon },
  { id: "business", label: "Business", icon: Building2Icon },
  { id: "posts", label: "Previous posts", icon: FileTextIcon },
  { id: "instructions", label: "Instructions", icon: SlidersHorizontalIcon },
];

export function CustomizeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const rawTab = searchParams.get("tab") as CustomizeTab | null;
  const activeTab: CustomizeTab =
    rawTab && TABS.some((t) => t.id === rawTab) ? rawTab : "learned";

  const [inspectDocId, setInspectDocId] = React.useState<string | null>(null);
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
      toast.success("Updated learned profile. Recompiling...");
      invalidateAll();
    },
    onError: (err: Error) => toast.error(err.message || "Failed to update overrides."),
  });

  const compileMutation = useMutation({
    mutationFn: triggerCustomizationCompile,
    onSuccess: () => {
      toast.success("Rebuild queued.");
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
      <div className="mx-auto max-w-4xl py-8 px-4 sm:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Customization is not enabled</CardTitle>
            <CardDescription>
              Enable <code className="text-xs bg-muted px-1 py-0.5 rounded">CUSTOMIZATION_ENABLED=true</code> in the backend environment to use playbooks, business context, and voice learning.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const docs = docsQuery.data ?? [];
  const playbooks = docs.filter((d) => d.kind === "playbook");
  const businessDocs = docs.filter((d) => d.kind === "business");
  const prevPostsDocs = docs.filter((d) => d.kind === "previous_posts");
  const overview = overviewQuery.data;
  const settings = overview?.settings;

  const handleTabChange = (val: string) => {
    router.replace(`/app/customize?tab=${val}`, { scroll: false });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Customize your agent
        </h1>
        <p className="text-sm text-muted-foreground">
          Upload your LinkedIn playbooks, business details, previous posts, and instructions. Every generated post uses them.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="flex flex-wrap h-auto gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger key={tab.id} value={tab.id} className="gap-1.5">
                <Icon className="size-4" />
                <span>{tab.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="learned">
          <LearnedProfilePanel
            context={contextQuery.data}
            isLoading={contextQuery.isLoading}
            onSaveVoiceOverride={(summary) =>
              overridesMutation.mutate({ voice_summary_override: summary })
            }
            onRemoveFact={(factId) => {
              const current = contextQuery.data?.compiled?.guidance?.business_facts ?? [];
              const remaining = current.filter((f) => f.id !== factId);
              overridesMutation.mutate({ removed_fact_ids: [factId] });
              if (remaining.length === 0) toast.info("Fact removed.");
            }}
            onRebuild={() => compileMutation.mutate()}
            onOpenHistory={() => setHistoryOpen(true)}
            isRebuilding={compileMutation.isPending}
          />
        </TabsContent>

        <TabsContent value="playbooks">
          <PlaybooksSection
            docs={playbooks}
            mode={settings?.default_playbook_mode ?? "merge"}
            onModeChange={(mode) => settingsMutation.mutate({ default_playbook_mode: mode })}
            onUpload={(files) => uploadMutation.mutate({ files, kind: "playbook" })}
            onToggleEnabled={(doc: DocumentSummary, enabled: boolean) =>
              toggleDocMutation.mutate({ id: doc.id, enabled })
            }
            onInspect={(doc) => setInspectDocId(doc.id)}
            onReprocess={(doc) => reprocessMutation.mutate(doc.id)}
            onDelete={(doc) => deleteMutation.mutate(doc.id)}
            isUploading={uploadMutation.isPending}
            activeUploads={activeUploadsByKind.playbook}
          />
        </TabsContent>

        <TabsContent value="business">
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
            onInspect={(doc) => setInspectDocId(doc.id)}
            onReprocess={(doc) => reprocessMutation.mutate(doc.id)}
            onDelete={(doc) => deleteMutation.mutate(doc.id)}
            isUploading={uploadMutation.isPending}
            activeUploads={activeUploadsByKind.business}
          />
        </TabsContent>

        <TabsContent value="posts">
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
            onInspect={(doc) => setInspectDocId(doc.id)}
            onReprocess={(doc) => reprocessMutation.mutate(doc.id)}
            onDelete={(doc) => deleteMutation.mutate(doc.id)}
            isUploading={uploadMutation.isPending}
            activeUploads={activeUploadsByKind.previous_posts}
          />
        </TabsContent>

        <TabsContent value="instructions">
          <InstructionsSection
            initialInstructions={settings?.custom_instructions ?? ""}
            detectedConstraints={settings?.detected_constraints ?? []}
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
        onToggleSamplePin={(id, pinned) => sampleMutation.mutate({ id, payload: { pinned } })}
        onToggleSampleExclude={(id, excluded) =>
          sampleMutation.mutate({ id, payload: { excluded } })
        }
      />

      <VersionHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onActivateVersion={(id) => activateVersionMutation.mutate(id)}
      />
    </div>
  );
}
