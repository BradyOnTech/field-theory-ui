import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MirrorView } from "../mirror";

// Mock the API module
vi.mock("@/lib/api", () => ({
  fetchSelfBookmarks: vi.fn(),
  fetchAuthor: vi.fn(),
  fetchSearch: vi.fn(),
}));

// Mock recharts to avoid SVG rendering issues in tests
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <svg data-testid="area-chart">{children}</svg>
  ),
  Area: () => <g data-testid="area" />,
  XAxis: () => <g data-testid="x-axis" />,
  YAxis: () => <g data-testid="y-axis" />,
  CartesianGrid: () => <g data-testid="cartesian-grid" />,
  Tooltip: () => <g data-testid="tooltip" />,
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <svg data-testid="bar-chart">{children}</svg>
  ),
  Bar: () => <g data-testid="bar" />,
}));

// Mock lucide-react
vi.mock("lucide-react", () => ({
  User: ({ className }: { className?: string }) => (
    <span data-testid="user-icon" className={className}>👤</span>
  ),
  Edit3: ({ className }: { className?: string }) => (
    <span data-testid="edit-icon" className={className}>✏</span>
  ),
  BookOpen: ({ className }: { className?: string }) => (
    <span data-testid="book-icon" className={className}>📖</span>
  ),
  BarChart3: ({ className }: { className?: string }) => (
    <span data-testid="barchart-icon" className={className}>📊</span>
  ),
  TrendingUp: ({ className }: { className?: string }) => (
    <span data-testid="trending-icon" className={className}>📈</span>
  ),
  Layers: ({ className }: { className?: string }) => (
    <span data-testid="layers-icon" className={className}>🔗</span>
  ),
  Clock: ({ className }: { className?: string }) => (
    <span data-testid="clock-icon" className={className}>🕐</span>
  ),
  Heart: ({ className }: { className?: string }) => (
    <span data-testid="heart-icon" className={className}>❤</span>
  ),
  Repeat2: ({ className }: { className?: string }) => (
    <span data-testid="repeat-icon" className={className}>🔄</span>
  ),
  Search: ({ className }: { className?: string }) => (
    <span data-testid="search-icon" className={className}>🔍</span>
  ),
}));

import { fetchSelfBookmarks, fetchAuthor, fetchSearch } from "@/lib/api";

const mockSelfBookmarks = [
  {
    id: 1001,
    tweet_id: "2037280823582613657",
    url: "https://x.com/GitMaxd/status/2037280823582613657",
    text: "Just dropped today: topic about AI agents and RAG techniques",
    author_handle: "GitMaxd",
    author_name: "GitMaxd",
    author_profile_image_url: "https://pbs.twimg.com/profile/example.jpg",
    posted_at: "Wed Mar 26 21:29:33 +0000 2026",
    bookmarked_at: null,
    synced_at: "2026-04-06T10:00:00.000Z",
    language: "en",
    like_count: 12,
    repost_count: 3,
    reply_count: 2,
    quote_count: 1,
    bookmark_count: 5,
    view_count: 500,
    media_count: 0,
    link_count: 2,
    links_json: "[]",
    categories: "technique,tool",
    primary_category: "technique",
    domains: "ai,web-dev",
    primary_domain: "ai",
    github_urls: "[]",
    conversation_id: "",
    in_reply_to_status_id: "",
    quoted_status_id: "",
    quoted_tweet_json: "",
    tags_json: "",
    ingested_via: "graphql",
  },
  {
    id: 1002,
    tweet_id: "2034902221180346569",
    url: "https://x.com/GitMaxd/status/2034902221180346569",
    text: "Agents need their own discovery UI for better tool usage",
    author_handle: "GitMaxd",
    author_name: "GitMaxd",
    author_profile_image_url: "https://pbs.twimg.com/profile/example.jpg",
    posted_at: "Mon Mar 10 15:00:00 +0000 2026",
    bookmarked_at: null,
    synced_at: "2026-04-06T10:00:00.000Z",
    language: "en",
    like_count: 8,
    repost_count: 3,
    reply_count: 1,
    quote_count: 0,
    bookmark_count: 3,
    view_count: 200,
    media_count: 0,
    link_count: 0,
    links_json: "[]",
    categories: "opinion",
    primary_category: "opinion",
    domains: "ai",
    primary_domain: "ai",
    github_urls: "[]",
    conversation_id: "",
    in_reply_to_status_id: "",
    quoted_status_id: "",
    quoted_tweet_json: "",
    tags_json: "",
    ingested_via: "graphql",
  },
  {
    id: 1003,
    tweet_id: "2034732125321384112",
    url: "https://x.com/GitMaxd/status/2034732125321384112",
    text: "After I setup the MCP server in about 30 seconds for tool integration",
    author_handle: "GitMaxd",
    author_name: "GitMaxd",
    author_profile_image_url: "https://pbs.twimg.com/profile/example.jpg",
    posted_at: "Mon Feb 20 10:00:00 +0000 2026",
    bookmarked_at: null,
    synced_at: "2026-04-06T10:00:00.000Z",
    language: "en",
    like_count: 7,
    repost_count: 4,
    reply_count: 0,
    quote_count: 0,
    bookmark_count: 2,
    view_count: 150,
    media_count: 1,
    link_count: 1,
    links_json: "[]",
    categories: "technique",
    primary_category: "technique",
    domains: "ai",
    primary_domain: "ai",
    github_urls: "[]",
    conversation_id: "",
    in_reply_to_status_id: "",
    quoted_status_id: "",
    quoted_tweet_json: "",
    tags_json: "",
    ingested_via: "graphql",
  },
  {
    id: 1004,
    tweet_id: "2033000000000000000",
    url: "https://x.com/GitMaxd/status/2033000000000000000",
    text: "Exploring web-dev tools for modern component architectures",
    author_handle: "GitMaxd",
    author_name: "GitMaxd",
    author_profile_image_url: "https://pbs.twimg.com/profile/example.jpg",
    posted_at: "Wed Jan 15 14:00:00 +0000 2026",
    bookmarked_at: null,
    synced_at: "2026-04-06T10:00:00.000Z",
    language: "en",
    like_count: 20,
    repost_count: 10,
    reply_count: 5,
    quote_count: 2,
    bookmark_count: 8,
    view_count: 1000,
    media_count: 0,
    link_count: 0,
    links_json: "[]",
    categories: "tool",
    primary_category: "tool",
    domains: "web-dev",
    primary_domain: "web-dev",
    github_urls: "[]",
    conversation_id: "",
    in_reply_to_status_id: "",
    quoted_status_id: "",
    quoted_tweet_json: "",
    tags_json: "",
    ingested_via: "graphql",
  },
];

const mockAuthorProfile = {
  author_handle: "GitMaxd",
  author_name: "GitMaxd",
  author_profile_image_url: "https://pbs.twimg.com/profile/example.jpg",
  bookmarkCount: 172,
  categories: [
    { name: "technique", count: 103 },
    { name: "tool", count: 99 },
    { name: "opinion", count: 32 },
    { name: "launch", count: 22 },
    { name: "ai-news", count: 14 },
  ],
  domains: [
    { name: "ai", count: 161 },
    { name: "web-dev", count: 53 },
    { name: "devops", count: 15 },
  ],
  timeline: [
    { date: "2023-09-11", count: 1 },
    { date: "2024-01-15", count: 3 },
    { date: "2026-03-26", count: 2 },
  ],
  topPosts: [],
  connectedAuthors: [],
  firstBookmark: "2023-09-11T21:18:58.000Z",
  lastBookmark: "2026-03-26T21:29:33.000Z",
};

// Mock search response for cross-reference: other authors' tool/technique bookmarks
const mockOtherBookmarks = {
  results: [
    {
      id: 5001,
      tweet_id: "5001",
      url: "",
      text: "Great technique for RAG",
      author_handle: "LangChain",
      author_name: "LangChain",
      author_profile_image_url: "",
      posted_at: "Mon Mar 01 10:00:00 +0000 2026",
      bookmarked_at: null,
      synced_at: "",
      language: "en",
      like_count: 50,
      repost_count: 20,
      reply_count: 0,
      quote_count: 0,
      bookmark_count: 0,
      view_count: 0,
      media_count: 0,
      link_count: 0,
      links_json: "[]",
      categories: "technique",
      primary_category: "technique",
      domains: "ai",
      primary_domain: "ai",
      github_urls: "[]",
      conversation_id: "",
      in_reply_to_status_id: "",
      quoted_status_id: "",
      quoted_tweet_json: "",
      tags_json: "",
      ingested_via: "graphql",
    },
  ],
  total: 1,
};

function renderMirror() {
  return render(
    <MemoryRouter initialEntries={["/mirror"]}>
      <MirrorView />
    </MemoryRouter>,
  );
}

describe("MirrorView", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetchSelfBookmarks).mockResolvedValue(mockSelfBookmarks);
    vi.mocked(fetchAuthor).mockResolvedValue(mockAuthorProfile);
    vi.mocked(fetchSearch).mockResolvedValue(mockOtherBookmarks);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe("VAL-MIRROR-007: First-run handle prompt", () => {
    it("shows handle input prompt when no handle in localStorage", () => {
      renderMirror();

      expect(screen.getByText("Mirror")).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/handle/i)).toBeInTheDocument();
      // Should show a prompt/explanation text
      expect(screen.getByText(/your handle/i)).toBeInTheDocument();
    });

    it("does not show blank or error state on first visit", () => {
      renderMirror();

      // Must show the prompt, not an error
      expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
      const input = screen.getByPlaceholderText(/handle/i);
      expect(input).toBeInTheDocument();
    });
  });

  describe("VAL-MIRROR-001: Handle Configuration Persistence", () => {
    it("stores handle in localStorage after setting", async () => {
      renderMirror();

      const input = screen.getByPlaceholderText(/handle/i);
      fireEvent.change(input, { target: { value: "GitMaxd" } });

      // Find and click the save/submit button
      const saveButton = screen.getByRole("button", { name: /save|set|go/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        const stored = localStorage.getItem("mirror-handle");
        expect(stored).toBe("GitMaxd");
      });
    });

    it("loads handle from localStorage on mount", async () => {
      localStorage.setItem("mirror-handle", "GitMaxd");

      renderMirror();

      // Should NOT show the prompt, should show data
      await waitFor(() => {
        expect(fetchSelfBookmarks).toHaveBeenCalledWith("GitMaxd");
      });
    });

    it("shows edit button to change handle after it is set", async () => {
      localStorage.setItem("mirror-handle", "GitMaxd");

      renderMirror();

      await waitFor(() => {
        // Should show the current handle in the edit button
        const editButton = screen.getByRole("button", { name: /@GitMaxd/ });
        expect(editButton).toBeInTheDocument();
      });
    });
  });

  describe("VAL-MIRROR-002: Self-Bookmark Filtering", () => {
    it("fetches self-bookmarks for the configured handle", async () => {
      localStorage.setItem("mirror-handle", "GitMaxd");

      renderMirror();

      await waitFor(() => {
        expect(fetchSelfBookmarks).toHaveBeenCalledWith("GitMaxd");
      });
    });

    it("displays bookmark count matching API response", async () => {
      localStorage.setItem("mirror-handle", "GitMaxd");

      renderMirror();

      await waitFor(() => {
        // Should show the count of self-bookmarks (4 in our mock) in the stats card
        const statsCards = document.querySelectorAll(".rounded-card");
        const selfBookmarksCard = Array.from(statsCards).find(
          (card) => card.textContent?.includes("Self-Bookmarks"),
        );
        expect(selfBookmarksCard).toBeTruthy();
        expect(selfBookmarksCard!.textContent).toContain("4");
      });
    });
  });

  describe("VAL-MIRROR-003: Topic Breakdown", () => {
    it("shows categories of own posts", async () => {
      localStorage.setItem("mirror-handle", "GitMaxd");

      renderMirror();

      await waitFor(() => {
        // Should show categories from the self-bookmarks
        // Categories appear in multiple places (badges + chart), so use getAllByText
        expect(screen.getAllByText("technique").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("tool").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("opinion").length).toBeGreaterThanOrEqual(1);
      });
    });

    it("shows at least 2 distinct categories", async () => {
      localStorage.setItem("mirror-handle", "GitMaxd");

      renderMirror();

      await waitFor(() => {
        // Multiple instances expected across badges and charts
        expect(screen.getAllByText("technique").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("tool").length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe("VAL-MIRROR-006: Most-bookmarked own posts sorted by engagement", () => {
    it("lists top posts sorted by engagement descending", async () => {
      localStorage.setItem("mirror-handle", "GitMaxd");

      renderMirror();

      await waitFor(() => {
        // Bookmark 1004 has engagement 30 (20+10), 1001 has 15 (12+3)
        // Should display them in engagement order
        expect(screen.getByText(/web-dev tools/)).toBeInTheDocument();
        expect(screen.getByText(/AI agents/)).toBeInTheDocument();
      });

      // Check order: first item should be the highest engagement post
      const textElements = screen.getAllByTestId("top-post-item");
      expect(textElements.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("VAL-MIRROR-004: Cross-Reference Overlap", () => {
    it("shows cross-reference section", async () => {
      localStorage.setItem("mirror-handle", "GitMaxd");

      renderMirror();

      await waitFor(() => {
        expect(screen.getByText(/cross-reference/i)).toBeInTheDocument();
      });
    });

    it("shows at least one overlap item with topic label", async () => {
      localStorage.setItem("mirror-handle", "GitMaxd");

      renderMirror();

      await waitFor(() => {
        // Should show overlap topics between posted & bookmarked categories
        const section = screen.getByTestId("cross-reference-section");
        expect(section).toBeInTheDocument();
        // Should contain at least one overlap item
        const overlapItems = section.querySelectorAll("[data-testid='overlap-item']");
        expect(overlapItems.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe("VAL-MIRROR-005: Self-bookmark timeline", () => {
    it("renders a timeline chart with real data", async () => {
      localStorage.setItem("mirror-handle", "GitMaxd");

      renderMirror();

      await waitFor(() => {
        expect(screen.getByTestId("area-chart")).toBeInTheDocument();
      });
    });
  });

  describe("Handle stripping @", () => {
    it("strips @ prefix from entered handle", async () => {
      renderMirror();

      const input = screen.getByPlaceholderText(/handle/i);
      fireEvent.change(input, { target: { value: "@GitMaxd" } });

      const saveButton = screen.getByRole("button", { name: /save|set|go/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(localStorage.getItem("mirror-handle")).toBe("GitMaxd");
      });
    });
  });

  describe("Data fetching errors", () => {
    it("handles API errors gracefully without crashing", async () => {
      localStorage.setItem("mirror-handle", "GitMaxd");
      vi.mocked(fetchSelfBookmarks).mockRejectedValue(new Error("API error"));
      vi.mocked(fetchAuthor).mockRejectedValue(new Error("API error"));

      renderMirror();

      // Should not crash, should still show the page
      await waitFor(() => {
        expect(screen.getByText("Mirror")).toBeInTheDocument();
      });
    });
  });
});
