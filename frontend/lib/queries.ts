// TanStack Query v5 centralized cache, query keys, hooks, and prefetchers
// In-memory cache only; keys are strictly namespaced by the signed-in user id
import {
  QueryCache,
  QueryClient,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ApiClientError,
  setReconnecting,
  getDashboard,
  getPosts,
  getPost,
  fetchPostImageBlob,
  getProfile,
  patchProfile,
  getConnections,
  disconnectLinkedInConnection,
  submitPostDecision,
  retryPostPublication,
  generateDraft,
  clearCachedToken,
  getLinkedInStatus,
  postToLinkedIn,
  getSlackStatus,
  disconnectSlack,
  createPlaygroundRun,
  cancelPlaygroundRun,
  getPlaygroundRunEvents,
  getRun,
  getPostAgentTrace,
  getAnalytics,
  getMyEntitlements,
  getPublicPlans,
  type RunEventsResponse,
} from "./api";
import type { PublicPlansResponse, UserEntitlements } from "../types/plans";
import type { DashboardData } from "../types/dashboard";
import type { AnalyticsDashboardData, AnalyticsRange } from "../types/analytics";
import type {
  GetPostsParams,
  PaginatedPosts,
  PostDetail,
  AgentTrace,
  RunResponse,
} from "../types/posts";
import type { Profile, PatchProfilePayload } from "../types/profile";
import type {
  SocialConnection,
  LinkedInStatusResponse,
  LinkedInPostResponse,
  SlackStatusResponse,
  SlackDisconnectResponse,
} from "../types/connections";


// Central in-memory QueryClient instance
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: () => {
      // Once retries are exhausted and the query enters an error state, stop showing the reconnecting banner
      setReconnecting(false);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error: unknown) => {
        // Retry only real network failures up to 3 times with increasing wait
        if (error instanceof ApiClientError && error.isNetworkError) {
          return failureCount < 3;
        }
        return false;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000),
    },
  },
});

// Clears the entire in-memory query cache, auth token, and client storage on sign out
export function clearAllAppCaches(): void {
  clearCachedToken();
  queryClient.clear();

  if (typeof window !== "undefined") {
    try {
      const theme = localStorage.getItem("theme");
      const nextTheme = localStorage.getItem("next-theme");

      localStorage.clear();
      sessionStorage.clear();

      if (theme) localStorage.setItem("theme", theme);
      if (nextTheme) localStorage.setItem("next-theme", nextTheme);
    } catch {
      // Storage access may be restricted in sandbox/privacy mode
    }
  }
}

export const clearClientState = clearAllAppCaches;

// Canonical query key factories strictly namespaced by signed-in user id
export const queryKeys = {
  all: (userId: string) => ["autopulse", userId || "anonymous"] as const,
  dashboard: (userId: string) =>
    ["autopulse", userId || "anonymous", "dashboard"] as const,
  posts: (userId: string, params?: GetPostsParams) =>
    ["autopulse", userId || "anonymous", "posts", params || {}] as const,
  post: (userId: string, postId: string) =>
    ["autopulse", userId || "anonymous", "post", postId] as const,
  postImage: (userId: string, postId: string, width: number) =>
    ["autopulse", userId || "anonymous", "post-image", postId, width] as const,
  profile: (userId: string) =>
    ["autopulse", userId || "anonymous", "profile"] as const,
  connections: (userId: string) =>
    ["autopulse", userId || "anonymous", "connections"] as const,
  linkedinStatus: (userId: string) =>
    ["autopulse", userId || "anonymous", "linkedin-status"] as const,
  slackStatus: (userId: string) =>
    ["autopulse", userId || "anonymous", "slack-status"] as const,
  run: (userId: string, runId: string) =>
    ["autopulse", userId || "anonymous", "run", runId] as const,
  postTrace: (userId: string, postId: string) =>
    ["autopulse", userId || "anonymous", "post-trace", postId] as const,
  analytics: (userId: string, range: AnalyticsRange = "30d") =>
    ["autopulse", userId || "anonymous", "analytics", range] as const,
};


// 1. Dashboard Overview Query (Freshness: 30s, refetches on window focus)
export function useDashboardQuery(userId: string) {
  return useQuery<DashboardData>({
    queryKey: queryKeys.dashboard(userId),
    queryFn: () => getDashboard(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    enabled: !!userId,
  });
}

// 2. Posts Query (Freshness: 30s)
export function usePostsQuery(userId: string, params?: GetPostsParams) {
  return useQuery<PaginatedPosts>({
    queryKey: queryKeys.posts(userId, params),
    queryFn: () => getPosts(params),
    staleTime: 30_000,
    enabled: !!userId,
  });
}

// 3. Post Detail Query (Freshness: 30s)
export function usePostDetailQuery(userId: string, postId: string) {
  return useQuery<PostDetail>({
    queryKey: queryKeys.post(userId, postId),
    queryFn: () => getPost(postId),
    staleTime: 30_000,
    enabled: !!userId && !!postId,
  });
}

// 4. Post Image Blob Query (Freshness: 5 minutes)
export function usePostImageQuery(
  userId: string,
  postId: string,
  width: 240 | 480 | 1200 = 480,
  enabled: boolean = true
) {
  return useQuery<Blob>({
    queryKey: queryKeys.postImage(userId, postId, width),
    queryFn: () => fetchPostImageBlob(postId, width),
    staleTime: 5 * 60_000,
    enabled: !!userId && !!postId && enabled,
  });
}

// 5. Profile Query (Freshness: 60s)
export function useProfileQuery(userId: string) {
  return useQuery<Profile>({
    queryKey: queryKeys.profile(userId),
    queryFn: () => getProfile(),
    staleTime: 60_000,
    enabled: !!userId,
  });
}

// 6. Connections Query (Freshness: 30s, refetches on window focus)
export function useConnectionsQuery(userId: string) {
  return useQuery<SocialConnection[]>({
    queryKey: queryKeys.connections(userId),
    queryFn: () => getConnections(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    enabled: !!userId,
  });
}

// 7. Analytics Dashboard Query (Freshness: 60s)
export function useAnalyticsQuery(userId: string, range: AnalyticsRange = "30d") {
  return useQuery<AnalyticsDashboardData>({
    queryKey: queryKeys.analytics(userId, range),
    queryFn: () => getAnalytics(range),
    staleTime: 60_000,
    enabled: !!userId,
  });
}

export function useEntitlements(userId?: string) {
  return useQuery<UserEntitlements>({
    queryKey: ["user", userId || "anon", "entitlements"],
    queryFn: () => getMyEntitlements(),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    enabled: !!userId,
  });
}

export function usePublicPlans() {
  return useQuery<PublicPlansResponse>({
    queryKey: ["public", "plans"],
    queryFn: () => getPublicPlans(),
    staleTime: 5 * 60_000,
  });
}

export function invalidateEntitlements(userId?: string) {
  if (!userId) return;
  queryClient.invalidateQueries({ queryKey: ["user", userId, "entitlements"] });
}

// Prefetch helpers for fast hover / keyboard focus navigation
export async function prefetchDashboard(userId: string): Promise<void> {
  if (!userId) return;
  await queryClient.prefetchQuery({
    queryKey: queryKeys.dashboard(userId),
    queryFn: () => getDashboard(),
    staleTime: 30_000,
  });
}

export async function prefetchPosts(
  userId: string,
  params?: GetPostsParams
): Promise<void> {
  if (!userId) return;
  await queryClient.prefetchQuery({
    queryKey: queryKeys.posts(userId, params),
    queryFn: () => getPosts(params),
    staleTime: 30_000,
  });
}

export async function prefetchPostDetail(
  userId: string,
  postId: string
): Promise<void> {
  if (!userId || !postId) return;
  await queryClient.prefetchQuery({
    queryKey: queryKeys.post(userId, postId),
    queryFn: () => getPost(postId),
    staleTime: 30_000,
  });
}

export async function prefetchProfile(userId: string): Promise<void> {
  if (!userId) return;
  await queryClient.prefetchQuery({
    queryKey: queryKeys.profile(userId),
    queryFn: () => getProfile(),
    staleTime: 60_000,
  });
}

export async function prefetchConnections(userId: string): Promise<void> {
  if (!userId) return;
  await queryClient.prefetchQuery({
    queryKey: queryKeys.connections(userId),
    queryFn: () => getConnections(),
    staleTime: 30_000,
  });
}

export async function prefetchAnalytics(
  userId: string,
  range: AnalyticsRange = "30d"
): Promise<void> {
  if (!userId) return;
  await queryClient.prefetchQuery({
    queryKey: queryKeys.analytics(userId, range),
    queryFn: () => getAnalytics(range),
    staleTime: 60_000,
  });
}

// Surgical mutation hooks
export function usePatchProfileMutation(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PatchProfilePayload) => patchProfile(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.profile(userId) });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard(userId) });
    },
  });
}

export function useSubmitDecisionMutation(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      decision,
    }: {
      id: string;
      decision: "approved" | "rejected";
    }) => submitPostDecision(id, decision),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.post(userId, vars.id) });
      qc.invalidateQueries({ queryKey: queryKeys.all(userId) });
    },
  });
}

export function useRetryPublicationMutation(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      confirmNotPosted,
    }: {
      id: string;
      confirmNotPosted?: boolean;
    }) => retryPostPublication(id, confirmNotPosted),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.post(userId, vars.id) });
      qc.invalidateQueries({ queryKey: queryKeys.all(userId) });
    },
  });
}

// Optimistically disconnect LinkedIn and roll back if the request fails
export function useDisconnectLinkedInMutation(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => disconnectLinkedInConnection(),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: queryKeys.connections(userId) });
      await qc.cancelQueries({ queryKey: queryKeys.linkedinStatus(userId) });
      const prevConnections = qc.getQueryData<SocialConnection[]>(queryKeys.connections(userId));
      const prevLinkedin = qc.getQueryData<LinkedInStatusResponse>(queryKeys.linkedinStatus(userId));

      qc.setQueryData<SocialConnection[]>(
        queryKeys.connections(userId),
        (old) => (old ? old.filter((c) => c.provider !== "linkedin") : [])
      );
      qc.setQueryData<LinkedInStatusResponse>(queryKeys.linkedinStatus(userId), (old) =>
        old ? { ...old, connected: false, status: "disconnected" } : old
      );

      return { prevConnections, prevLinkedin };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prevConnections !== undefined) {
        qc.setQueryData(queryKeys.connections(userId), ctx.prevConnections);
      }
      if (ctx?.prevLinkedin !== undefined) {
        qc.setQueryData(queryKeys.linkedinStatus(userId), ctx.prevLinkedin);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.connections(userId) });
      qc.invalidateQueries({ queryKey: queryKeys.linkedinStatus(userId) });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard(userId) });
    },
  });
}

export function useGenerateDraftMutation(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (replace: boolean = true) => generateDraft(replace),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.all(userId) });
    },
  });
}

// Query to inspect LinkedIn account connection state
export function useLinkedInStatusQuery(userId: string) {
  return useQuery<LinkedInStatusResponse>({
    queryKey: queryKeys.linkedinStatus(userId),
    queryFn: () => getLinkedInStatus(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    enabled: !!userId,
  });
}

// Mutation to publish direct manual posts to LinkedIn
export function usePostToLinkedInMutation(userId: string) {
  const qc = useQueryClient();
  return useMutation<LinkedInPostResponse, Error, FormData>({
    mutationFn: (formData: FormData) => postToLinkedIn(formData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.all(userId) });
      qc.invalidateQueries({ queryKey: queryKeys.linkedinStatus(userId) });
      qc.invalidateQueries({ queryKey: queryKeys.posts(userId) });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard(userId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Writing Agents Hooks
// ---------------------------------------------------------------------------

// Mutation to trigger an experimental playground run
export function useCreatePlaygroundRunMutation() {
  return useMutation<{ run_id: string; status?: string }, Error, string | undefined>({
    mutationFn: (topicHint?: string) => createPlaygroundRun(topicHint),
  });
}

// Mutation to cancel an active playground run
export function useCancelPlaygroundRunMutation() {
  return useMutation<
    { run_id: string; status: string; best_draft?: Record<string, any> | null },
    Error,
    string
  >({
    mutationFn: (runId: string) => cancelPlaygroundRun(runId),
  });
}

// Query to inspect or poll run status (refetches while running, stops on terminal or hidden tab)
export function useRunQuery(
  userId: string,
  runId: string | null,
  pollInterval: number | false | ((query: any) => number | false | undefined) = 2000
) {
  return useQuery<RunResponse>({
    queryKey: queryKeys.run(userId, runId || ""),
    queryFn: () => getRun(runId!),
    enabled: !!userId && !!runId,
    refetchIntervalInBackground: false,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      const isTerminal =
        status === "done" ||
        status === "succeeded" ||
        status === "completed" ||
        status === "failed" ||
        status === "failed_quality" ||
        status === "failed_error" ||
        status === "timed_out" ||
        status === "interrupted" ||
        status === "cancelled";
      if (isTerminal) {
        return false;
      }
      if (typeof pollInterval === "function") {
        return pollInterval(query);
      }
      return pollInterval;
    },
    staleTime: 0,
  });
}

// Query to load multi-agent audit trace for a post
export function usePostAgentTraceQuery(userId: string, postId: string) {
  return useQuery<{ trace: AgentTrace | null }>({
    queryKey: queryKeys.postTrace(userId, postId),
    queryFn: () => getPostAgentTrace(postId),
    enabled: !!userId && !!postId,
    staleTime: 60_000,
  });
}


// Query to inspect Slack integration state
export function useSlackStatusQuery(userId: string = "current") {
  return useQuery<SlackStatusResponse>({
    queryKey: queryKeys.slackStatus(userId),
    queryFn: () => getSlackStatus(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

// Optimistically disconnect Slack and roll back if the request fails
export function useDisconnectSlackMutation(userId: string = "current") {
  const qc = useQueryClient();
  return useMutation<SlackDisconnectResponse, Error, void, { prevSlack?: SlackStatusResponse }>({
    mutationFn: () => disconnectSlack(),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: queryKeys.slackStatus(userId) });
      const prevSlack = qc.getQueryData<SlackStatusResponse>(queryKeys.slackStatus(userId));
      qc.setQueryData<SlackStatusResponse>(queryKeys.slackStatus(userId), (old) =>
        old
          ? {
            ...old,
            connected: false,
            status: "not_connected",
            team_id: null,
            team_name: null,
          }
          : old
      );
      return { prevSlack };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prevSlack !== undefined) {
        qc.setQueryData(queryKeys.slackStatus(userId), ctx.prevSlack);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.slackStatus(userId) });
      qc.invalidateQueries({ queryKey: queryKeys.profile(userId) });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard(userId) });
    },
  });
}


