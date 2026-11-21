export type DocumentKind = "playbook" | "business" | "previous_posts";
export type SourceType = "upload" | "url" | "paste";
export type DocumentStatus =
  | "uploaded"
  | "extracting"
  | "distilling"
  | "embedding"
  | "ready"
  | "failed"
  | "disabled"
  | "deleted";

export interface DocumentSummary {
  id: string;
  kind: DocumentKind;
  source_type: SourceType;
  title: string;
  original_filename?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  source_url?: string | null;
  status: DocumentStatus;
  stage_name?: string | null;
  stage_index?: number | null;
  stage_total?: number;
  friendly_status?: string | null;
  friendly_error?: string | null;
  error_code?: string | null;
  error_detail?: string | null;
  needs_embedding: boolean;
  page_count?: number | null;
  char_count?: number | null;
  token_estimate?: number | null;
  enabled: boolean;
  duplicate: boolean;
  item_count?: number;
  created_at: string;
  updated_at: string;
  processed_at?: string | null;
}

export interface PostSampleView {
  id: string;
  document_id: string;
  ordinal: number;
  text: string;
  char_count: number;
  features: Record<string, unknown>;
  quality_flag?: string | null;
  pinned: boolean;
  excluded: boolean;
}

export interface FactView {
  id: string;
  document_id: string;
  kind: string;
  category: string;
  text: string;
  numbers: string[];
  evidence_quote?: string;
  source_label: string;
  applies_to?: string | null;
  is_core: boolean;
  removed: boolean;
}

export interface DocumentDetail extends DocumentSummary {
  text_preview?: string | null;
  distilled?: Record<string, unknown> | null;
  samples: PostSampleView[];
  facts: FactView[];
}

export interface DetectedConstraint {
  type: string;
  min?: number | null;
  max?: number | null;
  value?: string | null;
}

export interface CustomizationSettingsView {
  custom_instructions?: string | null;
  default_playbook_mode: "merge" | "replace";
  use_previous_posts_for_voice: boolean;
  business_mention: "never" | "natural" | "often";
  active_version_id?: string | null;
  compile_pending: boolean;
  detected_constraints: DetectedConstraint[];
}

export interface QuotaUsage {
  playbooks_used: number;
  playbooks_max: number;
  business_docs_used: number;
  business_docs_max: number;
  business_urls_used: number;
  business_urls_max: number;
  previous_posts_docs_used: number;
  previous_posts_docs_max: number;
  samples_used: number;
  samples_max: number;
  storage_bytes_used: number;
  storage_bytes_max: number;
}

export interface CustomizationOverview {
  counts_by_kind: Record<string, number>;
  status_counts: Record<string, number>;
  settings: CustomizationSettingsView;
  active_version?: number | null;
  active_version_id?: string | null;
  compile_pending: boolean;
  quota: QuotaUsage;
}

export interface EffectivePolicy {
  length_min: number;
  length_max: number;
  first_line_max: number;
  paragraphs_min: number;
  paragraphs_max: number;
  hashtags_min: number;
  hashtags_max: number;
  hashtag_case: "camel" | "lower" | "any";
  emoji_policy: "none" | "sparse" | "allowed";
  allow_markdown_bullets: boolean;
  banned_phrases_extra: string[];
  required_end_phrase?: string | null;
  required_start_phrase?: string | null;
  question_ending: "allowed" | "required" | "forbidden";
  allow_first_person_events: boolean;
  provenance: Record<string, string>;
}

export interface PolicyItem {
  key: string;
  label: string;
  value: string;
  source_type: "playbook" | "custom_instructions" | "default";
  document_name?: string | null;
  evidence_quote?: string | null;
}

export interface CompiledContextView {
  version_id?: string | null;
  version: number;
  compile_pending: boolean;
  updated_at?: string | null;
  warnings: string[];
  token_counts: Record<string, number>;
  policy_items?: PolicyItem[];
  policy_items_by_post_type?: Record<string, PolicyItem[]>;
  compiled: {
    version_id: string;
    version: number;
    is_empty: boolean;
    coverage_warnings?: string[];
    policy: EffectivePolicy & {
      hashtags_in_body?: boolean;
      first_comment_hashtags_max?: number;
      no_question_hooks?: boolean;
      require_number_hook?: boolean;
      length_by_post_type?: Record<string, { min?: number; max?: number }>;
    };
    guidance: {
      playbook_rules_text?: string;
      playbook_rule_ids?: string[];
      voice_summary?: string;
      voice_traits?: string[];
      vocabulary_preferred?: string[];
      vocabulary_avoid?: string[];
      exemplars?: Array<{ id: string; document_id: string; text: string; char_count: number; pinned: boolean }>;
      business_brief_text?: string;
      business_facts?: Array<{ id: string; category: string; text: string; numbers: string[]; source_label: string; is_core?: boolean }>;
      terminology?: string[];
      claims_to_avoid?: string[];
      content_pillars?: string[];
      custom_instructions?: string;
      business_mention?: string;
    };
    sources: Array<{ id: string; kind: string; title: string; source_type: string }>;
    warnings: string[];
  };
}

export interface VersionSummary {
  id: string;
  version: number;
  compiler_version: string;
  token_counts: Record<string, number>;
  warnings: string[];
  is_active: boolean;
  created_at: string;
}
