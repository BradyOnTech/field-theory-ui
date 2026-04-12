import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { StreamView } from "../stream";

// Mock IntersectionObserver for jsdom (required by infinite scroll sentinel)
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(public callback: IntersectionObserverCallback) {}
}
vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

// Mock the API module
vi.mock("@/lib/api", () => ({
  fetchSearch: vi.fn(),
  fetchCategories: vi.fn(),
  fetchDomains: vi.fn(),
}));

import { fetchSearch, fetchCategories, fetchDomains } from "@/lib/api";

const mockBookmarks = [
  {
    id: 1,
    tweet_id: "111111",
    url: "https://x.com/user1/status/111111",
    text: "RAG is a powerful technique for grounding LLMs with retrieval-augmented generation pipelines",
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
    media_count: 2,
    link_count: 1,
    links_json: '[{"url":"https://example.com/rag","display":"example.com/rag","title":"RAG Guide"}]',
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
    tweet_id: "222222",
    url: "https://x.com/hwchase17/status/222222",
    text: "LangChain now supports advanced RAG patterns with multi-step retrieval",
    author_handle: "hwchase17",
    author_name: "Harrison Chase",
    author_profile_image_url: "",
    posted_at: "Sun Apr 05 10:00:00 +0000 2026",
    posted_at_iso: "2026-04-05T10:00:00.000Z",
    bookmarked_at: null,
    synced_at: "2026-04-06T16:00:00.000Z",
    language: "en",
    like_count: 200,
    repost_count: 50,
    reply_count: 30,
    quote_count: 10,
    bookmark_count: 40,
    view_count: 50000,
    media_count: 0,
    link_count: 0,
    links_json: "",
    categories: "tool",
    primary_category: "tool",
    domains: "ai",
    primary_domain: "ai",
    github_urls: '["https://github.com/langchain-ai/langchain"]',
    conversation_id: "",
    in_reply_to_status_id: "",
    quoted_status_id: "",
    quoted_tweet_json: "",
    tags_json: "",
    ingested_via: "graphql",
  },
  {
    id: 3,
    tweet_id: "333333",
    url: "https://x.com/user3/status/333333",
    text: "Building production ML pipelines with proper monitoring",
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
    links_json: '["https://example.com/ml-pipeline"]',
    categories: "technique",
    primary_category: "technique",
    domains: "ai,data",
    primary_domain: "ai",
    github_urls: "[]",
    conversation_id: "",
    in_reply_to_status_id: "",
    quoted_status_id: "",
    quoted_tweet_json: "",
    tags_json: "",
    ingested_via: "graphql",
  },
];

const mockCategories = [
  { name: "technique", count: 1420 },
  { name: "tool", count: 980 },
  { name: "concept", count: 560 },
];

const mockDomains = [
  { name: "ai", count: 2874 },
  { name: "web", count: 450 },
  { name: "devops", count: 300 },
];

function renderStream(initialEntries = ["/stream"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <StreamView />
    </MemoryRouter>,
  );
}

describe("StreamView", () => {
  beforeEach(() => {
    vi.mocked(fetchSearch).mockResolvedValue({
      results: mockBookmarks,
      total: 3,
    });
    vi.mocked(fetchCategories).mockResolvedValue(mockCategories);
    vi.mocked(fetchDomains).mockResolvedValue(mockDomains);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Search Bar", () => {
    it("renders a search input at the top", async () => {
      renderStream();

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText(/search bookmarks/i);
        expect(searchInput).toBeInTheDocument();
      });
    });

    it("triggers search on form submit", async () => {
      renderStream();

      await waitFor(() => {
        expect(fetchSearch).toHaveBeenCalled();
      });

      const searchInput = screen.getByPlaceholderText(/search bookmarks/i);
      fireEvent.change(searchInput, { target: { value: "RAG" } });
      fireEvent.submit(searchInput.closest("form")!);

      await waitFor(() => {
        expect(fetchSearch).toHaveBeenCalledWith(
          expect.objectContaining({ q: "RAG", limit: 20, offset: 0 }),
          expect.any(AbortSignal),
        );
      });
    });
  });

  describe("Filter Bar", () => {
    it("renders category dropdown populated from API", async () => {
      renderStream();

      await waitFor(() => {
        expect(fetchCategories).toHaveBeenCalled();
      });

      const categorySelect = screen.getByLabelText(/category/i);
      expect(categorySelect).toBeInTheDocument();
    });

    it("renders domain dropdown populated from API", async () => {
      renderStream();

      await waitFor(() => {
        expect(fetchDomains).toHaveBeenCalled();
      });

      const domainSelect = screen.getByLabelText(/domain/i);
      expect(domainSelect).toBeInTheDocument();
    });

    it("renders author text input", async () => {
      renderStream();

      await waitFor(() => {
        expect(fetchSearch).toHaveBeenCalled();
      });

      const authorInput = screen.getByPlaceholderText(/author/i);
      expect(authorInput).toBeInTheDocument();
    });

    it("renders date range inputs", async () => {
      renderStream();

      await waitFor(() => {
        expect(fetchSearch).toHaveBeenCalled();
      });

      const afterInput = screen.getByLabelText(/after|from|start/i);
      const beforeInput = screen.getByLabelText(/before|to|end/i);
      expect(afterInput).toBeInTheDocument();
      expect(beforeInput).toBeInTheDocument();
    });
  });

  describe("Bookmark Cards", () => {
    it("renders bookmark cards with author handle", async () => {
      renderStream();

      await waitFor(() => {
        expect(screen.getByText("@user1")).toBeInTheDocument();
      });

      expect(screen.getByText("@hwchase17")).toBeInTheDocument();
      expect(screen.getByText("@user3")).toBeInTheDocument();
    });

    it("renders bookmark text content", async () => {
      renderStream();

      await waitFor(() => {
        expect(
          screen.getByText(/RAG is a powerful technique/),
        ).toBeInTheDocument();
      });
    });

    it("renders category and domain badges", async () => {
      renderStream();

      await waitFor(() => {
        expect(screen.getByText("@user1")).toBeInTheDocument();
      });

      // Primary category badge
      const techniqueBadges = screen.getAllByText("technique");
      expect(techniqueBadges.length).toBeGreaterThan(0);

      // Primary domain badge
      const aiBadges = screen.getAllByText("ai");
      expect(aiBadges.length).toBeGreaterThan(0);
    });

    it("renders engagement stats", async () => {
      renderStream();

      await waitFor(() => {
        expect(screen.getByText("@user1")).toBeInTheDocument();
      });

      // Should show like_count, repost_count, bookmark_count
      expect(screen.getByText("42")).toBeInTheDocument();
      expect(screen.getByText("10")).toBeInTheDocument();
    });

    it("renders clickable links from links_json", async () => {
      renderStream();

      await waitFor(() => {
        expect(screen.getByText("@user1")).toBeInTheDocument();
      });

      const link = screen.getByText("example.com/rag");
      expect(link).toBeInTheDocument();
      expect(link.closest("a")).toHaveAttribute("href", "https://example.com/rag");
    });

    it("renders clickable links from plain string array links_json", async () => {
      renderStream();

      await waitFor(() => {
        expect(screen.getByText("@user3")).toBeInTheDocument();
      });

      const link = screen.getByText("https://example.com/ml-pipeline");
      expect(link).toBeInTheDocument();
      expect(link.closest("a")).toHaveAttribute("href", "https://example.com/ml-pipeline");
    });

    it("renders author handle as clickable link to people profile", async () => {
      renderStream();

      await waitFor(() => {
        expect(screen.getByText("@user1")).toBeInTheDocument();
      });

      const authorLink = screen.getByText("@user1");
      expect(authorLink.closest("a")).toHaveAttribute("href", "/people/user1");
    });

    it("renders media count indicator when media_count > 0", async () => {
      renderStream();

      await waitFor(() => {
        expect(screen.getByText("@user1")).toBeInTheDocument();
      });

      // First bookmark has media_count=2
      expect(screen.getByText(/2 media/i)).toBeInTheDocument();
    });

    it("handles missing avatar with fallback", async () => {
      renderStream();

      await waitFor(() => {
        expect(screen.getByText("@hwchase17")).toBeInTheDocument();
      });

      // hwchase17 has empty author_profile_image_url - should show fallback with initial
      expect(screen.getByText("H")).toBeInTheDocument();
    });
  });

  describe("Card Expansion", () => {
    it("expands card on click showing full text and Open in X link", async () => {
      renderStream();

      await waitFor(() => {
        expect(screen.getByText("@user1")).toBeInTheDocument();
      });

      // Click on first bookmark card
      const card = screen.getByText("@user1").closest("[data-testid='bookmark-card']");
      expect(card).toBeInTheDocument();
      fireEvent.click(card!);

      await waitFor(() => {
        const openLink = screen.getByText(/open in x/i);
        expect(openLink).toBeInTheDocument();
        expect(openLink.closest("a")).toHaveAttribute(
          "href",
          "https://x.com/user1/status/111111",
        );
      });
    });

    it("collapses expanded card on Escape key", async () => {
      renderStream();

      await waitFor(() => {
        expect(screen.getByText("@user1")).toBeInTheDocument();
      });

      const card = screen.getByText("@user1").closest("[data-testid='bookmark-card']");
      fireEvent.click(card!);

      await waitFor(() => {
        expect(screen.getByText(/open in x/i)).toBeInTheDocument();
      });

      fireEvent.keyDown(document, { key: "Escape" });

      await waitFor(() => {
        expect(screen.queryByText(/open in x/i)).not.toBeInTheDocument();
      });
    });
  });

  describe("Empty State", () => {
    it("shows empty state message when no results", async () => {
      vi.mocked(fetchSearch).mockResolvedValue({
        results: [],
        total: 0,
      });

      renderStream();

      await waitFor(() => {
        // The empty state message appears in the empty state area
        expect(
          screen.getByText("Try adjusting your search or filters"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("Result Count", () => {
    it("shows total result count", async () => {
      renderStream();

      await waitFor(() => {
        expect(screen.getByText(/3 bookmarks/i)).toBeInTheDocument();
      });
    });
  });

  describe("Infinite Scroll", () => {
    it("calls fetchSearch with offset 0 on initial load", async () => {
      renderStream();

      await waitFor(() => {
        expect(fetchSearch).toHaveBeenCalledWith(
          expect.objectContaining({ limit: 20, offset: 0 }),
          expect.any(AbortSignal),
        );
      });
    });
  });

  describe("Data Fetching", () => {
    it("loads categories and domains for filter dropdowns", async () => {
      renderStream();

      await waitFor(() => {
        expect(fetchCategories).toHaveBeenCalled();
        expect(fetchDomains).toHaveBeenCalled();
      });
    });
  });

  describe("Click Outside to Collapse", () => {
    it("collapses expanded card when clicking outside it", async () => {
      renderStream();

      await waitFor(() => {
        expect(screen.getByText("@user1")).toBeInTheDocument();
      });

      // Expand a card
      const card = screen.getByText("@user1").closest("[data-testid='bookmark-card']");
      fireEvent.click(card!);

      await waitFor(() => {
        expect(screen.getByText(/open in x/i)).toBeInTheDocument();
      });

      // Click outside (on the document body)
      fireEvent.mouseDown(document.body);

      await waitFor(() => {
        expect(screen.queryByText(/open in x/i)).not.toBeInTheDocument();
      });
    });

    it("does NOT collapse when clicking inside the expanded card", async () => {
      renderStream();

      await waitFor(() => {
        expect(screen.getByText("@user1")).toBeInTheDocument();
      });

      // Expand a card
      const card = screen.getByText("@user1").closest("[data-testid='bookmark-card']");
      fireEvent.click(card!);

      await waitFor(() => {
        expect(screen.getByText(/open in x/i)).toBeInTheDocument();
      });

      // Click inside the expanded card (on the engagement text)
      fireEvent.mouseDown(card!);

      // Card should still be expanded
      expect(screen.getByText(/open in x/i)).toBeInTheDocument();
    });
  });

  describe("Bookmark List Rendering", () => {
    it("renders all bookmark cards in the list", async () => {
      renderStream();

      await waitFor(() => {
        expect(screen.getByText("@user1")).toBeInTheDocument();
      });

      expect(screen.getByText("@hwchase17")).toBeInTheDocument();
      expect(screen.getByText("@user3")).toBeInTheDocument();
    });
  });
});
