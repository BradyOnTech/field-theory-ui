import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OracleView } from "../oracle";

// Mock scrollIntoView for jsdom
Element.prototype.scrollIntoView = vi.fn();

// Mock OpenUI packages (ESM-only, not compatible with jsdom test env)
vi.mock("@openuidev/react-lang", () => ({
  Renderer: () => null,
  BuiltinActionType: { ContinueConversation: "continue_conversation" },
}));
vi.mock("@openuidev/react-ui/genui-lib", () => ({
  openuiLibrary: {},
}));

// Mock the API module
vi.mock("@/lib/api", () => ({
  fetchOracle: vi.fn(),
  fetchRandomBookmark: vi.fn(),
  fetchOracleStatus: vi.fn(),
}));

import { fetchOracle, fetchRandomBookmark, fetchOracleStatus } from "@/lib/api";

const mockOracleResponse = {
  answer: 'You have 234 bookmarks about "AI".',
  apiCall: "/api/search?q=AI",
  results: [
    {
      id: 1,
      tweet_id: "111",
      url: "https://x.com/user1/status/111",
      text: "AI bookmark about machine learning techniques",
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
  ],
  total: 234,
};

const mockRandomBookmark = {
  id: 99,
  tweet_id: "99999",
  url: "https://x.com/random/status/99999",
  text: "A random interesting bookmark about distributed systems",
  author_handle: "random_author",
  author_name: "Random Author",
  author_profile_image_url: "",
  posted_at: "Fri Mar 20 10:00:00 +0000 2026",
  posted_at_iso: "2026-03-20T10:00:00.000Z",
  bookmarked_at: null,
  synced_at: "2026-03-20T11:00:00.000Z",
  language: "en",
  like_count: 15,
  repost_count: 3,
  reply_count: 1,
  quote_count: 0,
  bookmark_count: 2,
  view_count: 500,
  media_count: 0,
  link_count: 0,
  links_json: "[]",
  categories: "concept",
  primary_category: "concept",
  domains: "infrastructure",
  primary_domain: "infrastructure",
  github_urls: "[]",
  conversation_id: "",
  in_reply_to_status_id: "",
  quoted_status_id: "",
  quoted_tweet_json: "",
  tags_json: "",
  ingested_via: "graphql",
};

function renderOracle() {
  return render(
    <MemoryRouter initialEntries={["/oracle"]}>
      <OracleView />
    </MemoryRouter>,
  );
}

describe("OracleView", () => {
  beforeEach(() => {
    vi.mocked(fetchOracleStatus).mockResolvedValue({ proAvailable: false });
    vi.mocked(fetchOracle).mockResolvedValue(mockOracleResponse);
    vi.mocked(fetchRandomBookmark).mockResolvedValue(mockRandomBookmark);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Empty State / Welcome", () => {
    it("shows welcome message on first load", () => {
      renderOracle();

      expect(screen.getByText("Chat with your X Bookmarks")).toBeInTheDocument();
      expect(
        screen.getByText(/Ask questions about your bookmark collection/),
      ).toBeInTheDocument();
    });

    it("shows example query buttons", () => {
      renderOracle();

      expect(
        screen.getByText("What have I been bookmarking this month vs last month?"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Find GitHub repos I bookmarked but probably forgot about"),
      ).toBeInTheDocument();
    });

    it("shows surprise me button in welcome state", () => {
      renderOracle();

      expect(screen.getByTestId("surprise-me-button")).toBeInTheDocument();
    });
  });

  describe("Chat UI Layout", () => {
    it("renders oracle view container", () => {
      renderOracle();
      expect(screen.getByTestId("oracle-view")).toBeInTheDocument();
    });

    it("renders message area", () => {
      renderOracle();
      expect(screen.getByTestId("message-area")).toBeInTheDocument();
    });

    it("renders input bar with text field and send button", () => {
      renderOracle();
      expect(screen.getByTestId("input-bar")).toBeInTheDocument();
      expect(screen.getByTestId("oracle-input")).toBeInTheDocument();
      expect(screen.getByTestId("send-button")).toBeInTheDocument();
    });

    it("input is focused on mount", () => {
      renderOracle();
      expect(screen.getByTestId("oracle-input")).toHaveFocus();
    });
  });

  describe("Sending Messages", () => {
    it("sends message on Enter key press", async () => {
      renderOracle();
      const input = screen.getByTestId("oracle-input");

      fireEvent.change(input, {
        target: { value: "How many bookmarks about AI?" },
      });
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() => {
        expect(fetchOracle).toHaveBeenCalledWith(
          "How many bookmarks about AI?",
          expect.any(Array),
        );
      });
    });

    it("sends message on send button click", async () => {
      renderOracle();
      const input = screen.getByTestId("oracle-input");
      const sendButton = screen.getByTestId("send-button");

      fireEvent.change(input, {
        target: { value: "Show me recent bookmarks" },
      });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(fetchOracle).toHaveBeenCalled();
      });
    });

    it("clears input after sending", async () => {
      renderOracle();
      const input = screen.getByTestId("oracle-input") as HTMLInputElement;

      fireEvent.change(input, { target: { value: "test query" } });
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() => {
        expect(input.value).toBe("");
      });
    });

    it("sends example query when clicking example button", async () => {
      renderOracle();
      const exampleButton = screen.getByText(
        "What have I been bookmarking this month vs last month?",
      );

      fireEvent.click(exampleButton);

      await waitFor(() => {
        expect(fetchOracle).toHaveBeenCalledWith(
          "What have I been bookmarking this month vs last month?",
          expect.any(Array),
        );
      });
    });
  });

  describe("Message Display", () => {
    it("displays user message bubble after sending", async () => {
      renderOracle();
      const input = screen.getByTestId("oracle-input");

      fireEvent.change(input, {
        target: { value: "How many bookmarks about AI?" },
      });
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() => {
        expect(screen.getByText("How many bookmarks about AI?")).toBeInTheDocument();
      });
    });

    it("displays assistant response after query", async () => {
      renderOracle();
      const input = screen.getByTestId("oracle-input");

      fireEvent.change(input, {
        target: { value: "How many bookmarks about AI?" },
      });
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() => {
        expect(
          screen.getByText('You have 234 bookmarks about "AI".'),
        ).toBeInTheDocument();
      });
    });

    it("shows transparent API call display", async () => {
      renderOracle();
      const input = screen.getByTestId("oracle-input");

      fireEvent.change(input, {
        target: { value: "How many bookmarks about AI?" },
      });
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() => {
        expect(screen.getByTestId("api-call-display")).toBeInTheDocument();
        expect(screen.getByText(/Searched:.*\/api\/search\?q=AI/)).toBeInTheDocument();
      });
    });

    it("renders bookmark results as clickable cards", async () => {
      renderOracle();
      const input = screen.getByTestId("oracle-input");

      fireEvent.change(input, {
        target: { value: "Show me AI bookmarks" },
      });
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() => {
        expect(
          screen.getByText("AI bookmark about machine learning techniques"),
        ).toBeInTheDocument();
        expect(screen.getByText("@user1")).toBeInTheDocument();
      });
    });
  });

  describe("Surprise Me", () => {
    it("fetches random bookmark on surprise me click", async () => {
      renderOracle();
      const surpriseButton = screen.getByTestId("surprise-me-button");

      fireEvent.click(surpriseButton);

      await waitFor(() => {
        expect(fetchRandomBookmark).toHaveBeenCalled();
      });
    });

    it("displays random bookmark after surprise me", async () => {
      renderOracle();
      const surpriseButton = screen.getByTestId("surprise-me-button");

      fireEvent.click(surpriseButton);

      await waitFor(() => {
        expect(
          screen.getByText(/random interesting bookmark/),
        ).toBeInTheDocument();
        expect(screen.getByText("@random_author")).toBeInTheDocument();
      });
    });
  });

  describe("Follow-up Context", () => {
    it("passes conversation context on follow-up query", async () => {
      renderOracle();
      const input = screen.getByTestId("oracle-input");

      // Send first message
      fireEvent.change(input, {
        target: { value: "Show me tool bookmarks" },
      });
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() => {
        expect(fetchOracle).toHaveBeenCalledTimes(1);
      });

      // Send follow-up
      fireEvent.change(input, {
        target: { value: "now just from @hwchase17" },
      });
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() => {
        expect(fetchOracle).toHaveBeenCalledTimes(2);
        // Second call should have context from first conversation
        const secondCall = vi.mocked(fetchOracle).mock.calls[1];
        expect(secondCall).toBeDefined();
        expect(secondCall![1]).toBeDefined();
        expect(secondCall![1]!.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Error Handling", () => {
    it("shows error message when API fails", async () => {
      vi.mocked(fetchOracle).mockRejectedValueOnce(new Error("Network error"));

      renderOracle();
      const input = screen.getByTestId("oracle-input");

      fireEvent.change(input, { target: { value: "test query" } });
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() => {
        expect(screen.getByText(/Network error/)).toBeInTheDocument();
      });
    });

    it("does not send empty messages", () => {
      renderOracle();
      const sendButton = screen.getByTestId("send-button");

      fireEvent.click(sendButton);

      expect(fetchOracle).not.toHaveBeenCalled();
    });
  });
});
