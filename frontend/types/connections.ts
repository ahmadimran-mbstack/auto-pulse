// Type definitions for social account connections and OAuth flows

export type ConnectionStatus = "active" | "expired" | "revoked";

export interface SocialConnection {
  provider: string;
  status: ConnectionStatus;
  account_name: string | null;
  connected_at: string;
  expires_at: string;
  days_left: number;
}

export interface OAuthStartResponse {
  authorization_url: string;
}

export interface OAuthCallbackPayload {
  code: string;
  state: string;
}

// Four distinct presentation states for the dashboard connection row
export type ConnectionDisplayState =
  | "not_connected"
  | "connected"
  | "expiring_soon"
  | "expired";

export interface LinkedInPostResponse {
  id: string;
  linkedin_post_id?: string | null;
  posted_at: string;
  visibility: "PUBLIC" | "CONNECTIONS";
}

export interface LinkedInStatusResponse {
  connected: boolean;
  expires_at: string | null;
  account_name: string | null;
  status?: string | null;
}

