export interface Bookmark {
  id: number;
  tweet_id: string;
  url: string;
  text: string;
  author_handle: string;
  author_name: string;
  author_profile_image_url: string;
  posted_at: string;
  bookmarked_at: string | null;
  synced_at: string;
  language: string;
  like_count: number;
  repost_count: number;
  reply_count: number;
  quote_count: number;
  bookmark_count: number;
  view_count: number;
  media_count: number;
  link_count: number;
  links_json: string;
  categories: string;
  primary_category: string;
  domains: string;
  primary_domain: string;
  github_urls: string;
  conversation_id: string;
  in_reply_to_status_id: string;
  quoted_status_id: string;
  quoted_tweet_json: string;
  tags_json: string;
  ingested_via: string;
  // Only populated by /api/bookmark/:id (detail). Absent on list responses.
  collections?: CollectionMembership[];
}

export interface Collection {
  id: number;
  slug: string;
  name: string;
  description: string;
  color: string;
  created_at: string;
  updated_at: string;
  bookmark_count: number;
}

export interface CollectionMembership {
  slug: string;
  name: string;
  color: string;
}

export interface CollectionDetail extends Collection {
  bookmarks: Bookmark[];
  total: number;
}

export interface QuotedTweetSnapshot {
  id: string;
  text: string;
  author_handle?: string;
  author_name?: string;
  author_profile_image_url?: string;
  posted_at?: string | null;
  media?: string[];
  url: string;
}

export interface Author {
  author_handle: string;
  author_name: string;
  author_profile_image_url: string;
  count: number;
  primary_domain: string;
  categories: CategoryCount[];
}

export interface Stats {
  totalBookmarks: number;
  uniqueAuthors: number;
  dateRange: {
    earliest: string;
    latest: string;
  };
  thisWeekCount: number;
  classifiedCount: number;
}

export interface CategoryCount {
  name: string;
  count: number;
}

export interface DomainCount {
  name: string;
  count: number;
}

export interface TimelineEntry {
  date: string;
  count: number;
}

export interface SearchParams {
  q?: string;
  author?: string;
  category?: string;
  domain?: string;
  collection?: string;
  after?: string;
  before?: string;
  limit?: number;
  offset?: number;
}

interface ConnectedAuthor {
  author_handle: string;
  author_name: string;
  author_profile_image_url: string;
  co_occurrence_count: number;
}

export interface AuthorProfile {
  author_handle: string;
  author_name: string;
  author_profile_image_url: string;
  bookmarkCount: number;
  categories: CategoryCount[];
  domains: DomainCount[];
  timeline: TimelineEntry[];
  topPosts: Bookmark[];
  connectedAuthors: ConnectedAuthor[];
  firstBookmark: string;
  lastBookmark: string;
}

export interface SearchResult {
  results: Bookmark[];
  total: number;
}

export interface GithubRepo {
  url: string;
  count: number;
  lastSeen: string;
}

export interface OracleContext {
  role: "user" | "assistant";
  content: string;
  apiCall?: string;
}

export interface OracleResponse {
  answer: string;
  apiCall?: string;
  results?: Bookmark[];
  total?: number;
  mode?: "pro" | "standard";
}

export interface OracleStatus {
  proAvailable: boolean;
  webSearchAvailable?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  apiCall?: string;
  results?: Bookmark[];
  total?: number;
  isLoading?: boolean;
  mode?: "pro" | "standard";
  format?: "openui" | "text";
  streamStatus?: "thinking" | "querying" | "generating";
  isStreaming?: boolean;
  isFading?: boolean;
}

export type OracleStreamEvent =
  | { step: "model"; status: "thinking" }
  | { step: "tools"; status: "querying" | "executed" }
  | { step: "token"; content: string }
  | { step: "token_reset" }
  | { step: "done"; answer: string; mode: "pro" }
  | { step: "error"; error: string };

interface MonthDomainCount {
  domain: string;
  count: number;
}

interface MonthCategoryCount {
  category: string;
  count: number;
}

interface MonthAuthor {
  author_handle: string;
  author_name: string;
  count: number;
}

interface MonthBookmark {
  id: string;
  text: string;
  author_handle: string;
  posted_at_iso: string;
  like_count: number;
  repost_count: number;
}

export interface MonthlyBreakdownEntry {
  month: string;
  count: number;
  domains: MonthDomainCount[];
  categories: MonthCategoryCount[];
  topAuthors: MonthAuthor[];
  notableBookmarks: MonthBookmark[];
  newAuthors: string[];
}

// --- Forge types ---

export interface TechniqueBookmark {
  id: string;
  text: string;
  author_handle: string;
  author_name: string;
  posted_at_iso: string;
  like_count: number;
  repost_count: number;
  primary_domain: string;
}

export interface TechniqueGroup {
  domain: string;
  count: number;
  bookmarks: TechniqueBookmark[];
}

export interface GitHubMetadataEntry {
  owner: string;
  repo: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  html_url: string;
  fetched_at: string;
  error?: string;
}

export interface GitHubMetadataMap {
  [key: string]: GitHubMetadataEntry;
}


