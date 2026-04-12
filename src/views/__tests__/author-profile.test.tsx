import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthorProfileView } from "../author-profile";

// Mock the API module
vi.mock("@/lib/api", () => ({
  fetchAuthor: vi.fn(),
}));

// Mock recharts to avoid SVG rendering issues in jsdom
vi.mock("recharts", () => ({
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  Area: () => <div data-testid="area" />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}));

import { fetchAuthor } from "@/lib/api";
import type { AuthorProfile } from "@/lib/types";

const mockProfile: AuthorProfile = {
  author_handle: "LangChain",
  author_name: "LangChain",
  author_profile_image_url:
    "https://pbs.twimg.com/profile_images/123/avatar_normal.jpg",
  bookmarkCount: 326,
  categories: [
    { name: "tool", count: 207 },
    { name: "technique", count: 178 },
    { name: "opinion", count: 42 },
  ],
  domains: [
    { name: "ai", count: 280 },
    { name: "dev", count: 35 },
    { name: "data", count: 11 },
  ],
  timeline: [
    { date: "2025-01-15", count: 3 },
    { date: "2025-02-20", count: 5 },
    { date: "2025-03-10", count: 8 },
    { date: "2025-04-01", count: 2 },
  ],
  topPosts: [
    {
      id: 1,
      tweet_id: "t1",
      url: "https://x.com/LangChain/status/t1",
      text: "This is the top post by engagement with lots of likes",
      author_handle: "LangChain",
      author_name: "LangChain",
      author_profile_image_url: "",
      posted_at: "Mon Mar 10 12:00:00 +0000 2025",
      bookmarked_at: null,
      synced_at: "2025-04-01T00:00:00Z",
      language: "en",
      like_count: 500,
      repost_count: 200,
      reply_count: 50,
      quote_count: 10,
      bookmark_count: 30,
      view_count: 10000,
      media_count: 0,
      link_count: 0,
      links_json: "",
      categories: "tool,technique",
      primary_category: "tool",
      domains: "ai",
      primary_domain: "ai",
      github_urls: "",
      conversation_id: "",
      in_reply_to_status_id: "",
      quoted_status_id: "",
      quoted_tweet_json: "",
      tags_json: "",
      ingested_via: "graphql",
    },
    {
      id: 2,
      tweet_id: "t2",
      url: "https://x.com/LangChain/status/t2",
      text: "Second most engaging post about AI techniques",
      author_handle: "LangChain",
      author_name: "LangChain",
      author_profile_image_url: "",
      posted_at: "Fri Feb 20 10:00:00 +0000 2025",
      bookmarked_at: null,
      synced_at: "2025-04-01T00:00:00Z",
      language: "en",
      like_count: 300,
      repost_count: 100,
      reply_count: 20,
      quote_count: 5,
      bookmark_count: 15,
      view_count: 5000,
      media_count: 0,
      link_count: 0,
      links_json: "",
      categories: "technique",
      primary_category: "technique",
      domains: "ai",
      primary_domain: "ai",
      github_urls: "",
      conversation_id: "",
      in_reply_to_status_id: "",
      quoted_status_id: "",
      quoted_tweet_json: "",
      tags_json: "",
      ingested_via: "graphql",
    },
  ],
  connectedAuthors: [
    {
      author_handle: "hwchase17",
      author_name: "Harrison Chase",
      author_profile_image_url: "",
      co_occurrence_count: 45,
    },
    {
      author_handle: "GitMaxd",
      author_name: "Git Maxd",
      author_profile_image_url: "",
      co_occurrence_count: 30,
    },
  ],
  firstBookmark: "2024-06-15T10:30:00.000Z",
  lastBookmark: "2026-03-28T14:20:00.000Z",
};

function renderProfile(handle = "LangChain") {
  return render(
    <MemoryRouter initialEntries={[`/people/${handle}`]}>
      <Routes>
        <Route path="/people/:handle" element={<AuthorProfileView />} />
        <Route path="/people" element={<div>People Grid</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AuthorProfileView", () => {
  beforeEach(() => {
    vi.mocked(fetchAuthor).mockResolvedValue(mockProfile);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Author Header", () => {
    it("displays author handle, name, and bookmark count", async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText("@LangChain")).toBeInTheDocument();
      });

      expect(screen.getByText("326")).toBeInTheDocument();
      expect(screen.getByText("bookmarks")).toBeInTheDocument();
    });

    it("fetches profile data for the handle from URL", async () => {
      renderProfile("LangChain");

      await waitFor(() => {
        expect(fetchAuthor).toHaveBeenCalledWith("LangChain");
      });
    });

    it("renders the author header section", async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByTestId("author-header")).toBeInTheDocument();
      });
    });
  });

  describe("Activity Sparkline", () => {
    it("renders the activity sparkline section", async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByTestId("activity-sparkline")).toBeInTheDocument();
      });

      expect(screen.getByText("Bookmark Activity")).toBeInTheDocument();
    });

    it("renders a Recharts AreaChart with timeline data", async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByTestId("area-chart")).toBeInTheDocument();
      });
    });
  });

  describe("Category Breakdown", () => {
    it("renders category breakdown section", async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByTestId("category-breakdown")).toBeInTheDocument();
      });

      expect(screen.getByText("Categories")).toBeInTheDocument();
    });

    it("shows author-specific categories with counts", async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText("tool")).toBeInTheDocument();
      });

      expect(screen.getByText("technique")).toBeInTheDocument();
      expect(screen.getByText("opinion")).toBeInTheDocument();

      // Category counts
      expect(screen.getByText("207")).toBeInTheDocument();
      expect(screen.getByText("178")).toBeInTheDocument();
      expect(screen.getByText("42")).toBeInTheDocument();
    });
  });

  describe("Domain Breakdown", () => {
    it("renders domain breakdown section", async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByTestId("domain-breakdown")).toBeInTheDocument();
      });

      expect(screen.getByText("Domains")).toBeInTheDocument();
    });

    it("shows author-specific domains with counts", async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText("ai")).toBeInTheDocument();
      });

      expect(screen.getByText("dev")).toBeInTheDocument();
      expect(screen.getByText("data")).toBeInTheDocument();

      // Domain counts
      expect(screen.getByText("280")).toBeInTheDocument();
      expect(screen.getByText("35")).toBeInTheDocument();
      expect(screen.getByText("11")).toBeInTheDocument();
    });
  });

  describe("Top Posts", () => {
    it("renders top posts section", async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByTestId("top-posts")).toBeInTheDocument();
      });

      expect(screen.getByText("Top Posts by Engagement")).toBeInTheDocument();
    });

    it("shows top posts with text, engagement metrics, and date", async () => {
      renderProfile();

      await waitFor(() => {
        expect(
          screen.getByText(/This is the top post by engagement/),
        ).toBeInTheDocument();
      });

      expect(
        screen.getByText(/Second most engaging post/),
      ).toBeInTheDocument();

      // Engagement numbers (like_count)
      expect(screen.getByText("500")).toBeInTheDocument();
      expect(screen.getByText("300")).toBeInTheDocument();

      // Total engagement (like + repost)
      expect(screen.getByText("700")).toBeInTheDocument();
      expect(screen.getByText("400")).toBeInTheDocument();
    });

    it("shows top posts sorted by engagement descending", async () => {
      renderProfile();

      await waitFor(() => {
        const postItems = screen.getAllByTestId("top-post-item");
        expect(postItems.length).toBe(2);
        // First post should be the one with higher engagement
        expect(postItems[0]).toHaveTextContent("top post by engagement");
        expect(postItems[1]).toHaveTextContent("Second most engaging");
      });
    });
  });

  describe("Connected Authors", () => {
    it("renders connected authors section", async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByTestId("connected-authors")).toBeInTheDocument();
      });

      expect(screen.getByText("Connected Authors")).toBeInTheDocument();
    });

    it("shows connected author handles with co-occurrence count", async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText("@hwchase17")).toBeInTheDocument();
      });

      expect(screen.getByText("@GitMaxd")).toBeInTheDocument();
      expect(screen.getByText("45 days")).toBeInTheDocument();
      expect(screen.getByText("30 days")).toBeInTheDocument();
    });

    it("renders connected author links to their profiles", async () => {
      renderProfile();

      await waitFor(() => {
        const links = screen.getAllByTestId("connected-author");
        expect(links.length).toBe(2);
        expect(links[0]).toHaveAttribute("href", "/people/hwchase17");
        expect(links[1]).toHaveAttribute("href", "/people/GitMaxd");
      });
    });

    it("shows empty state when no connected authors", async () => {
      vi.mocked(fetchAuthor).mockResolvedValue({
        ...mockProfile,
        connectedAuthors: [],
      });

      renderProfile();

      await waitFor(() => {
        expect(screen.getByText("No connected authors found")).toBeInTheDocument();
      });
    });
  });

  describe("First/Last Bookmark Dates", () => {
    it("shows first and last bookmark dates", async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByTestId("bookmark-dates")).toBeInTheDocument();
      });

      // June 15, 2024 and March 28, 2026
      expect(screen.getByText(/First:.*June 15, 2024/)).toBeInTheDocument();
      expect(screen.getByText(/Last:.*March 28, 2026/)).toBeInTheDocument();
    });

    it("shows dates in correct chronological order (first < last)", async () => {
      renderProfile();

      await waitFor(() => {
        const datesEl = screen.getByTestId("bookmark-dates");
        expect(datesEl).toBeInTheDocument();
      });

      // First date should be earlier than last date
      const firstDate = new Date(mockProfile.firstBookmark);
      const lastDate = new Date(mockProfile.lastBookmark);
      expect(firstDate.getTime()).toBeLessThan(lastDate.getTime());
    });
  });

  describe("Deep Link", () => {
    it("loads profile when navigating directly to /people/LangChain", async () => {
      renderProfile("LangChain");

      await waitFor(() => {
        expect(screen.getByText("@LangChain")).toBeInTheDocument();
      });

      expect(screen.getByText("326")).toBeInTheDocument();
      expect(screen.getByTestId("activity-sparkline")).toBeInTheDocument();
      expect(screen.getByTestId("top-posts")).toBeInTheDocument();
    });
  });

  describe("Back Navigation", () => {
    it("shows a back button", async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByTestId("back-button")).toBeInTheDocument();
      });

      expect(screen.getByText("Back to People")).toBeInTheDocument();
    });
  });

  describe("Error Handling", () => {
    it("shows error state when profile fetch fails", async () => {
      vi.mocked(fetchAuthor).mockRejectedValue(new Error("Failed to load"));

      renderProfile("nonexistent_user");

      await waitFor(() => {
        expect(screen.getByText("Author not found")).toBeInTheDocument();
        expect(screen.getByText("Failed to load")).toBeInTheDocument();
      });
    });

    it("does not crash with empty timeline", async () => {
      vi.mocked(fetchAuthor).mockResolvedValue({
        ...mockProfile,
        timeline: [],
      });

      renderProfile();

      await waitFor(() => {
        expect(screen.getByText("No activity data available")).toBeInTheDocument();
      });
    });

    it("does not crash with empty categories", async () => {
      vi.mocked(fetchAuthor).mockResolvedValue({
        ...mockProfile,
        categories: [],
      });

      renderProfile();

      await waitFor(() => {
        expect(screen.getByText("No categories")).toBeInTheDocument();
      });
    });

    it("does not crash with empty top posts", async () => {
      vi.mocked(fetchAuthor).mockResolvedValue({
        ...mockProfile,
        topPosts: [],
      });

      renderProfile();

      await waitFor(() => {
        expect(screen.getByText("No posts found")).toBeInTheDocument();
      });
    });
  });
});
