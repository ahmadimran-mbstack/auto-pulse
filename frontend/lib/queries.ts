// TanStack Query v5 centralized cache, query keys, hooks, and prefetchers
// In-memory cache only; keys are strictly namespaced by the signed-in user id
import {
  QueryClient,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
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
  getRun,
  getPostAgentTrace,
} from "./api";
import type { DashboardData } from "../types/dashboard";
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
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error: unknown) => {
        // Do not retry 401 or 404 client errors
        if (
          error &&
          typeof error === "object" &&
          "status" in error &&
          (error.status === 401 || error.status === 404)
        ) {
          return false;
        }
        return failureCount < 2;
      },
    },
  },
});

// Clears the entire in-memory query cache and auth token on sign out
export function clearAllAppCaches(): void {
  clearCachedToken();
  queryClient.clear();
}

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
  width: 240 | 480 | 1200 = 480
) {
  return useQuery<Blob>({
    queryKey: queryKeys.postImage(userId, postId, width),
    queryFn: () => fetchPostImageBlob(postId, width),
    staleTime: 5 * 60_000,
    enabled: !!userId && !!postId,
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

// 6. Connections Query (Freshness: 30s)
export function useConnectionsQuery(userId: string) {
  return useQuery<SocialConnection[]>({
    queryKey: queryKeys.connections(userId),
    queryFn: () => getConnections(),
    staleTime: 30_000,
    enabled: !!userId,
  });
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

export function useDisconnectLinkedInMutation(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => disconnectLinkedInConnection(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.connections(userId) });
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
    staleTime: 10_000,
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
  return useMutation<{ run_id: string }, Error, string | undefined>({
    mutationFn: (topicHint?: string) => createPlaygroundRun(topicHint),
  });
}

// Query to inspect or poll run status (refetches every 2s while running)
export function useRunQuery(
  userId: string,
  runId: string | null,
  pollInterval: number | false = 2000
) {
  return useQuery<RunResponse>({
    queryKey: queryKeys.run(userId, runId || ""),
    queryFn: () => getRun(runId!),
    enabled: !!userId && !!runId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "done" || status === "failed") {
        return false;
      }
      return pollInterval;
    },
    staleTime: 1000,
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
    staleTime: 10_000,
  });
}

// Mutation to disconnect Slack integration
export function useDisconnectSlackMutation(userId: string = "current") {
  const qc = useQueryClient();
  return useMutation<SlackDisconnectResponse, Error, void>({
    mutationFn: () => disconnectSlack(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.slackStatus(userId) });
      qc.invalidateQueries({ queryKey: queryKeys.profile(userId) });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard(userId) });
    },
  });
}


