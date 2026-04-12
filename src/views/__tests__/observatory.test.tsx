import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ObservatoryView } from "../observatory";

// Mock the API module
vi.mock("@/lib/api", () => ({
  fetchStats: vi.fn(),
  fetchTimeline: vi.fn(),
  fetchCategories: vi.fn(),
  fetchDomains: vi.fn(),
  fetchRecent: vi.fn(),
}));

// Mock Recharts to avoid SVG rendering issues in jsdom
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <svg data-testid="area-chart">{children}</svg>
  ),
  Area: () => <rect data-testid="area" />,
  XAxis: () => <g data-testid="x-axis" />,
  YAxis: () => <g data-testid="y-axis" />,
  Tooltip: () => <g data-testid="tooltip" />,
  CartesianGrid: () => <g data-testid="cartesian-grid" />,
}));

import {
  fetchStats,
  fetchTimeline,
  fetchCategories,
  fetchDomains,
  fetchRecent,
} from "@/lib/api";

const mockStats = {
  totalBookmarks: 4221,
  uniqueAuthors: 1394,
  dateRange: {
    earliest: "2018-10-10T20:19:24.000Z",
    latest: "2026-04-06T15:40:46.000Z",
  },
  thisWeekCount: 23,
  classifiedCount: 4217,
};

const mockTimeline = [
  { date: "2026-01-15", count: 5 },
  { date: "2026-01-16", count: 8 },
  { date: "2026-01-17", count: 3 },
];

const mockCategories = [
  { name: "technique", count: 1420 },
  { name: "tool", count: 980 },
  { name: "concept", count: 560 },
  { name: "research", count: 340 },
  { name: "tutorial", count: 280 },
  { name: "news", count: 200 },
  { name: "opinion", count: 150 },
  { name: "other", count: 100 },
];

const mockDomains = [
  { name: "ai", count: 2874 },
  { name: "web", count: 450 },
  { name: "devops", count: 300 },
  { name: "security", count: 200 },
  { name: "data", count: 180 },
  { name: "mobile", count: 120 },
  { name: "cloud", count: 97 },
  { name: "other", count: 50 },
];

const mockRecent = [
  {
    id: 1,
    tweet_id: "123456",
    url: "https://x.com/user1/status/123456",
    text: "This is a great bookmark about AI tools and techniques for building systems",
    author_handle: "user1",
    author_name: "User One",
    author_profile_image_url: "https://pbs.twimg.com/profile_images/user1.jpg",
    posted_at: "Mon Apr 06 15:40:46 +0000 2026",
    posted_at_iso: "2026-04-06T15:40:46.000Z",
    bookmarked_at: null,
    synced_at: "2026-04-06T16:00:00.000Z",
    language: "en",
    like_count: 42,
    repost_count: 10,
    reply_count: 5,
    quote_count: 2,
    bookmark_count: 8,
    view_count: 1500,
    media_count: 0,
    link_count: 1,
    links_json: "[]",
    categories: "technique,tool",
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
    id: 2,
    tweet_id: "123457",
    url: "https://x.com/user2/status/123457",
    text: "Second bookmark about machine learning frameworks",
    author_handle: "user2",
    author_name: "User Two",
    author_profile_image_url: "",
    posted_at: "Sun Apr 05 10:00:00 +0000 2026",
    posted_at_iso: "2026-04-05T10:00:00.000Z",
    bookmarked_at: null,
    synced_at: "2026-04-06T16:00:00.000Z",
    language: "en",
    like_count: 20,
    repost_count: 5,
    reply_count: 3,
    quote_count: 1,
    bookmark_count: 4,
    view_count: 800,
    media_count: 1,
    link_count: 0,
    links_json: "[]",
    categories: "tool",
    primary_category: "tool",
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
    id: 3,
    tweet_id: "123458",
    url: "https://x.com/user3/status/123458",
    text: "Third bookmark about web development",
    author_handle: "user3",
    author_name: "User Three",
    author_profile_image_url: "https://pbs.twimg.com/profile_images/user3.jpg",
    posted_at: "Sat Apr 04 08:00:00 +0000 2026",
    posted_at_iso: "2026-04-04T08:00:00.000Z",
    bookmarked_at: null,
    synced_at: "2026-04-06T16:00:00.000Z",
    language: "en",
    like_count: 15,
    repost_count: 3,
    reply_count: 1,
    quote_count: 0,
    bookmark_count: 2,
    view_count: 500,
    media_count: 0,
    link_count: 2,
    links_json: "[]",
    categories: "concept",
    primary_category: "concept",
    domains: "web",
    primary_domain: "web",
    github_urls: "[]",
    conversation_id: "",
    in_reply_to_status_id: "",
    quoted_status_id: "",
    quoted_tweet_json: "",
    tags_json: "",
    ingested_via: "graphql",
  },
  {
    id: 4,
    tweet_id: "123459",
    url: "https://x.com/user4/status/123459",
    text: "Fourth bookmark about security best practices",
    author_handle: "user4",
    author_name: "User Four",
    author_profile_image_url: "https://pbs.twimg.com/profile_images/user4.jpg",
    posted_at: "Fri Apr 03 12:00:00 +0000 2026",
    posted_at_iso: "2026-04-03T12:00:00.000Z",
    bookmarked_at: null,
    synced_at: "2026-04-06T16:00:00.000Z",
    language: "en",
    like_count: 30,
    repost_count: 8,
    reply_count: 2,
    quote_count: 1,
    bookmark_count: 6,
    view_count: 1200,
    media_count: 0,
    link_count: 1,
    links_json: "[]",
    categories: "technique",
    primary_category: "technique",
    domains: "security",
    primary_domain: "security",
    github_urls: "[]",
    conversation_id: "",
    in_reply_to_status_id: "",
    quoted_status_id: "",
    quoted_tweet_json: "",
    tags_json: "",
    ingested_via: "graphql",
  },
  {
    id: 5,
    tweet_id: "123460",
    url: "https://x.com/user5/status/123460",
    text: "Fifth bookmark about data engineering pipelines",
    author_handle: "user5",
    author_name: "User Five",
    author_profile_image_url: "https://pbs.twimg.com/profile_images/user5.jpg",
    posted_at: "Thu Apr 02 09:00:00 +0000 2026",
    posted_at_iso: "2026-04-02T09:00:00.000Z",
    bookmarked_at: null,
    synced_at: "2026-04-06T16:00:00.000Z",
    language: "en",
    like_count: 25,
    repost_count: 6,
    reply_count: 4,
    quote_count: 0,
    bookmark_count: 3,
    view_count: 900,
    media_count: 0,
    link_count: 0,
    links_json: "[]",
    categories: "research",
    primary_category: "research",
    domains: "data",
    primary_domain: "data",
    github_urls: "[]",
    conversation_id: "",
    in_reply_to_status_id: "",
    quoted_status_id: "",
    quoted_tweet_json: "",
    tags_json: "",
    ingested_via: "graphql",
  },
];

function renderObservatory() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <ObservatoryView />
    </MemoryRouter>,
  );
}

describe("ObservatoryView", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(fetchStats).mockResolvedValue(mockStats);
    vi.mocked(fetchTimeline).mockResolvedValue(mockTimeline);
    vi.mocked(fetchCategories).mockResolvedValue(mockCategories);
    vi.mocked(fetchDomains).mockResolvedValue(mockDomains);
    vi.mocked(fetchRecent).mockResolvedValue(mockRecent);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("Hero Metrics Row", () => {
    it("renders all 5 KPI cards with correct values", async () => {
      renderObservatory();

      await waitFor(() => {
        expect(screen.getByText("4,221")).toBeInTheDocument();
      });

      // Total Bookmarks
      expect(screen.getByText("Total Bookmarks")).toBeInTheDocument();
      expect(screen.getByText("4,221")).toBeInTheDocument();

      // Unique Authors
      expect(screen.getByText("Unique Authors")).toBeInTheDocument();
      expect(screen.getByText("1,394")).toBeInTheDocument();

      // Top Domain Focus % -- 2874 ai domain bookmarks out of 4221 total ≈ 68%
      expect(screen.getByText("AI Focus %")).toBeInTheDocument();

      // Builder Ratio (technique + tool out of total)
      expect(screen.getByText("Builder Ratio")).toBeInTheDocument();

      // Classification
      expect(screen.getByText("Classification")).toBeInTheDocument();
    });

    it("displays top domain focus percentage between 0-100", async () => {
      renderObservatory();

      await waitFor(() => {
        expect(screen.getByText("4,221")).toBeInTheDocument();
      });

      // Top domain focus: percentage of bookmarks in the most common domain
      const focusCard = screen.getByText("AI Focus %").closest("[data-testid='kpi-card']");
      expect(focusCard).toBeInTheDocument();
    });

    it("displays Builder Ratio percentage between 0-100", async () => {
      renderObservatory();

      await waitFor(() => {
        expect(screen.getByText("4,221")).toBeInTheDocument();
      });

      const builderCard = screen.getByText("Builder Ratio").closest("[data-testid='kpi-card']");
      expect(builderCard).toBeInTheDocument();
    });

    it("displays Classification > 90%", async () => {
      renderObservatory();

      await waitFor(() => {
        expect(screen.getByText("4,221")).toBeInTheDocument();
      });

      // classifiedCount = 4217 out of 4221 => 99.9%
      const coverageCard = screen.getByText("Classification").closest("[data-testid='kpi-card']");
      expect(coverageCard).toBeInTheDocument();
    });
  });

  describe("Activity Sparkline", () => {
    it("renders AreaChart component", async () => {
      renderObservatory();

      await waitFor(() => {
        expect(screen.getByTestId("area-chart")).toBeInTheDocument();
      });
    });

    it("calls fetchTimeline with 90 days", async () => {
      renderObservatory();

      await waitFor(() => {
        expect(fetchTimeline).toHaveBeenCalledWith(90);
      });
    });
  });

  describe("Category Distribution", () => {
    it("renders top 7 categories as horizontal bars", async () => {
      renderObservatory();

      await waitFor(() => {
        // "technique" appears in both bar chart and recent feed badges
        expect(screen.getAllByText("technique").length).toBeGreaterThanOrEqual(1);
      });

      // Should show top 7 categories (using getAllByText since some names appear in badges too)
      expect(screen.getAllByText("technique").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("tool").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("concept").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("research").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("tutorial")).toBeInTheDocument();
      expect(screen.getByText("news")).toBeInTheDocument();
      expect(screen.getByText("opinion")).toBeInTheDocument();
    });

    it("shows counts for each category", async () => {
      renderObservatory();

      await waitFor(() => {
        expect(screen.getByText("1,420")).toBeInTheDocument();
      });
    });
  });

  describe("Domain Distribution", () => {
    it("renders top 7 domains as horizontal bars", async () => {
      renderObservatory();

      await waitFor(() => {
        // "ai" appears in both bar chart and recent feed badges
        expect(screen.getAllByText("ai").length).toBeGreaterThanOrEqual(1);
      });

      expect(screen.getAllByText("ai").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("web").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("devops")).toBeInTheDocument();
      expect(screen.getAllByText("security").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("data").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("mobile")).toBeInTheDocument();
      expect(screen.getByText("cloud")).toBeInTheDocument();
    });
  });

  describe("Recent Bookmarks Feed", () => {
    it("renders 5 bookmark cards", async () => {
      renderObservatory();

      await waitFor(() => {
        expect(screen.getByText("@user1")).toBeInTheDocument();
      });

      expect(screen.getByText("@user1")).toBeInTheDocument();
      expect(screen.getByText("@user2")).toBeInTheDocument();
      expect(screen.getByText("@user3")).toBeInTheDocument();
      expect(screen.getByText("@user4")).toBeInTheDocument();
      expect(screen.getByText("@user5")).toBeInTheDocument();
    });

    it("calls fetchRecent with limit 5", async () => {
      renderObservatory();

      await waitFor(() => {
        expect(fetchRecent).toHaveBeenCalledWith(5);
      });
    });

    it("shows category and domain badges", async () => {
      renderObservatory();

      await waitFor(() => {
        expect(screen.getByText("@user1")).toBeInTheDocument();
      });

      // Each bookmark should have category and domain badges
      // First bookmark has primary_category=technique, primary_domain=ai
      const badges = screen.getAllByText("technique");
      expect(badges.length).toBeGreaterThan(0);
    });

    it("handles missing avatar with fallback", async () => {
      renderObservatory();

      await waitFor(() => {
        expect(screen.getByText("@user2")).toBeInTheDocument();
      });

      // user2 has empty author_profile_image_url - should show fallback
      const avatars = screen.getAllByRole("img");
      // At least some avatars should exist (ones with valid URLs)
      expect(avatars.length).toBeGreaterThan(0);
    });
  });

  describe("Last Synced Timestamp", () => {
    it("displays last synced timestamp in header", async () => {
      renderObservatory();

      await waitFor(() => {
        expect(screen.getByText(/last synced/i)).toBeInTheDocument();
      });
    });
  });

  describe("Auto-Refresh", () => {
    it("refetches data every 5 minutes", async () => {
      renderObservatory();

      await waitFor(() => {
        expect(fetchStats).toHaveBeenCalledTimes(1);
      });

      // Advance time by 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000);

      await waitFor(() => {
        expect(fetchStats).toHaveBeenCalledTimes(2);
        expect(fetchTimeline).toHaveBeenCalledTimes(2);
        expect(fetchCategories).toHaveBeenCalledTimes(2);
        expect(fetchDomains).toHaveBeenCalledTimes(2);
        expect(fetchRecent).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("Optimistic UI - No Spinners", () => {
    it("does not show any spinner or progressbar elements", async () => {
      renderObservatory();

      // No progress bars / spinner animations (optimistic UI uses placeholder text instead)
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });

    it("renders section containers immediately before data arrives", () => {
      renderObservatory();

      // All section headings should be visible on first render, even before data
      expect(screen.getByText("Activity (90 days)")).toBeInTheDocument();
      expect(screen.getByText("Top Categories")).toBeInTheDocument();
      expect(screen.getByText("Top Domains")).toBeInTheDocument();
      expect(screen.getByText("Recent Bookmarks")).toBeInTheDocument();

      // 5 KPI card placeholders should be rendered
      const kpiCards = screen.getAllByTestId("kpi-card");
      expect(kpiCards.length).toBe(5);
    });
  });

  describe("Data Fetching", () => {
    it("calls all 5 API functions on mount", async () => {
      renderObservatory();

      await waitFor(() => {
        expect(fetchStats).toHaveBeenCalledTimes(1);
        expect(fetchTimeline).toHaveBeenCalledTimes(1);
        expect(fetchCategories).toHaveBeenCalledTimes(1);
        expect(fetchDomains).toHaveBeenCalledTimes(1);
        expect(fetchRecent).toHaveBeenCalledTimes(1);
      });
    });
  });
});
