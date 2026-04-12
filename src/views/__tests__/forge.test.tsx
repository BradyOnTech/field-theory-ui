import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ForgeView } from "../forge";

// Mock the API module
vi.mock("@/lib/api", () => ({
  fetchGithubRepos: vi.fn(),
  fetchGithubMetadata: vi.fn(),
  fetchTechniqueBacklog: vi.fn(),
}));

// Mock lucide-react icons to avoid SVG rendering issues
vi.mock("lucide-react", () => ({
  Star: ({ className }: { className?: string }) => (
    <span data-testid="star-icon" className={className}>★</span>
  ),
  ExternalLink: ({ className }: { className?: string }) => (
    <span data-testid="external-link-icon" className={className}>↗</span>
  ),
  GitFork: ({ className }: { className?: string }) => (
    <span data-testid="git-fork-icon" className={className}>⑂</span>
  ),
  AlertTriangle: ({ className }: { className?: string }) => (
    <span data-testid="alert-triangle-icon" className={className}>⚠</span>
  ),
  Inbox: ({ className }: { className?: string }) => (
    <span data-testid="inbox-icon" className={className}>📥</span>
  ),
}));

import { fetchGithubRepos, fetchGithubMetadata, fetchTechniqueBacklog } from "@/lib/api";

const mockRepos = [
  { url: "https://github.com/virattt/ai-hedge-fund", owner: "virattt", repo: "ai-hedge-fund", count: 5, lastSeen: "2026-04-01T10:00:00.000Z" },
  { url: "https://github.com/mendableai/firecrawl", owner: "mendableai", repo: "firecrawl", count: 5, lastSeen: "2026-03-28T10:00:00.000Z" },
  { url: "https://github.com/qnguyen3/chat-with-mlx", owner: "qnguyen3", repo: "chat-with-mlx", count: 5, lastSeen: "2026-03-25T10:00:00.000Z" },
  { url: "https://github.com/NirDiamant/GenAI_Agents", owner: "NirDiamant", repo: "GenAI_Agents", count: 4, lastSeen: "2026-03-20T10:00:00.000Z" },
  { url: "https://github.com/virattt/financial-agent-ui", owner: "virattt", repo: "financial-agent-ui", count: 4, lastSeen: "2026-03-15T10:00:00.000Z" },
  { url: "https://github.com/langchain-ai/langgraph", owner: "langchain-ai", repo: "langgraph", count: 3, lastSeen: "2026-03-10T10:00:00.000Z" },
];

const mockMetadata: Record<string, {
  owner: string;
  repo: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  html_url: string;
  fetched_at: string;
  error?: string;
}> = {
  "virattt/ai-hedge-fund": {
    owner: "virattt",
    repo: "ai-hedge-fund",
    description: "AI-powered hedge fund for analyzing stocks",
    stargazers_count: 12500,
    language: "Python",
    html_url: "https://github.com/virattt/ai-hedge-fund",
    fetched_at: "2026-04-06T10:00:00.000Z",
  },
  "mendableai/firecrawl": {
    owner: "mendableai",
    repo: "firecrawl",
    description: "Turn any website into LLM-ready data",
    stargazers_count: 8700,
    language: "TypeScript",
    html_url: "https://github.com/mendableai/firecrawl",
    fetched_at: "2026-04-06T10:00:00.000Z",
  },
  "qnguyen3/chat-with-mlx": {
    owner: "qnguyen3",
    repo: "chat-with-mlx",
    description: "Chat with MLX models locally",
    stargazers_count: 3200,
    language: "Python",
    html_url: "https://github.com/qnguyen3/chat-with-mlx",
    fetched_at: "2026-04-06T10:00:00.000Z",
  },
  "nirdiamant/genai_agents": {
    owner: "NirDiamant",
    repo: "GenAI_Agents",
    description: "GenAI Agents collection",
    stargazers_count: 5100,
    language: "Jupyter Notebook",
    html_url: "https://github.com/NirDiamant/GenAI_Agents",
    fetched_at: "2026-04-06T10:00:00.000Z",
  },
  "virattt/financial-agent-ui": {
    owner: "virattt",
    repo: "financial-agent-ui",
    description: "Frontend for financial agent",
    stargazers_count: 1800,
    language: "TypeScript",
    html_url: "https://github.com/virattt/financial-agent-ui",
    fetched_at: "2026-04-06T10:00:00.000Z",
  },
  "langchain-ai/langgraph": {
    owner: "langchain-ai",
    repo: "langgraph",
    description: "Build stateful multi-agent apps",
    stargazers_count: 15000,
    language: "Python",
    html_url: "https://github.com/langchain-ai/langgraph",
    fetched_at: "2026-04-06T10:00:00.000Z",
  },
};

const mockTechniqueGroups = [
  {
    domain: "ai",
    count: 120,
    bookmarks: [
      {
        id: "1001",
        text: "RAG techniques for production systems — key patterns for chunking and retrieval",
        author_handle: "LangChain",
        author_name: "LangChain",
        posted_at_iso: "2026-03-15T10:00:00.000Z",
        like_count: 250,
        repost_count: 80,
        primary_domain: "ai",
      },
      {
        id: "1002",
        text: "Fine-tuning LLMs with LoRA: a practical guide for small teams",
        author_handle: "hwchase17",
        author_name: "Harrison Chase",
        posted_at_iso: "2026-03-10T10:00:00.000Z",
        like_count: 180,
        repost_count: 45,
        primary_domain: "ai",
      },
    ],
  },
  {
    domain: "web-dev",
    count: 30,
    bookmarks: [
      {
        id: "2001",
        text: "Modern CSS patterns for component-based architectures",
        author_handle: "css_expert",
        author_name: "CSS Expert",
        posted_at_iso: "2026-02-20T10:00:00.000Z",
        like_count: 90,
        repost_count: 30,
        primary_domain: "web-dev",
      },
    ],
  },
  {
    domain: "devops",
    count: 15,
    bookmarks: [
      {
        id: "3001",
        text: "Docker multi-stage builds for optimized production images",
        author_handle: "devops_guru",
        author_name: "DevOps Guru",
        posted_at_iso: "2026-01-15T10:00:00.000Z",
        like_count: 120,
        repost_count: 40,
        primary_domain: "devops",
      },
    ],
  },
];

function renderForge() {
  return render(
    <MemoryRouter initialEntries={["/forge"]}>
      <ForgeView />
    </MemoryRouter>,
  );
}

describe("ForgeView", () => {
  beforeEach(() => {
    vi.mocked(fetchGithubRepos).mockResolvedValue(mockRepos);
    vi.mocked(fetchGithubMetadata).mockResolvedValue(mockMetadata);
    vi.mocked(fetchTechniqueBacklog).mockResolvedValue(mockTechniqueGroups);
    // Clear localStorage before each test
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe("Page Layout", () => {
    it("renders the Forge title and description", async () => {
      renderForge();

      expect(screen.getByText("Forge")).toBeInTheDocument();
      await waitFor(() => {
        expect(
          screen.getByText(/build queue.*github repos.*technique backlog/i),
        ).toBeInTheDocument();
      });
    });

    it("renders both main sections", async () => {
      renderForge();

      await waitFor(() => {
        expect(screen.getByText("Saved Repos")).toBeInTheDocument();
      });
      expect(screen.getByText("Technique Backlog")).toBeInTheDocument();
    });
  });

  describe("Saved Repos Section", () => {
    it("displays repo cards with owner/repo format", async () => {
      renderForge();

      await waitFor(() => {
        expect(screen.getByText("virattt/ai-hedge-fund")).toBeInTheDocument();
      });

      expect(screen.getByText("mendableai/firecrawl")).toBeInTheDocument();
      expect(screen.getByText("qnguyen3/chat-with-mlx")).toBeInTheDocument();
    });

    it("shows at least 5 repos", async () => {
      renderForge();

      await waitFor(() => {
        expect(screen.getByText("virattt/ai-hedge-fund")).toBeInTheDocument();
      });

      expect(screen.getByText("mendableai/firecrawl")).toBeInTheDocument();
      expect(screen.getByText("qnguyen3/chat-with-mlx")).toBeInTheDocument();
      expect(screen.getByText("NirDiamant/GenAI_Agents")).toBeInTheDocument();
      expect(screen.getByText("virattt/financial-agent-ui")).toBeInTheDocument();
    });

    it("displays GitHub metadata: stars and language in table", async () => {
      renderForge();

      await waitFor(() => {
        // Star counts visible in table rows
        expect(screen.getByText("12,500")).toBeInTheDocument();
      });

      // Languages visible in table rows
      const pythonElements = screen.getAllByText("Python");
      expect(pythonElements.length).toBeGreaterThan(0);

      const tsElements = screen.getAllByText("TypeScript");
      expect(tsElements.length).toBeGreaterThan(0);
    });

    it("shows repo count badge", async () => {
      renderForge();

      await waitFor(() => {
        expect(screen.getByText("6")).toBeInTheDocument();
      });
    });

    it("deduplicates repos (no duplicate entries)", async () => {
      renderForge();

      await waitFor(() => {
        const links = screen.getAllByText("virattt/ai-hedge-fund");
        expect(links).toHaveLength(1);
      });
    });

    it("displays repo names in table rows", async () => {
      renderForge();

      await waitFor(() => {
        expect(screen.getByText("virattt/ai-hedge-fund")).toBeInTheDocument();
      });
    });

    it("shows mention count per repo in table", async () => {
      renderForge();

      await waitFor(() => {
        // Repos with count 5 should show "5" in the mentions column
        const fives = screen.getAllByText("5");
        expect(fives.length).toBeGreaterThanOrEqual(2);
      });
    });

    it("handles rate-limited repos gracefully in expanded row", async () => {
      const metadataWithRateLimit = {
        ...mockMetadata,
        "virattt/ai-hedge-fund": {
          ...mockMetadata["virattt/ai-hedge-fund"]!,
          error: "rate_limited",
          description: null,
          stargazers_count: 0,
          language: null,
        },
      };
      vi.mocked(fetchGithubMetadata).mockResolvedValue(metadataWithRateLimit);

      renderForge();

      await waitFor(() => {
        expect(screen.getByText("virattt/ai-hedge-fund")).toBeInTheDocument();
      });

      // Click row to expand
      fireEvent.click(screen.getByText("virattt/ai-hedge-fund"));

      await waitFor(() => {
        expect(screen.getByText(/rate limited/i)).toBeInTheDocument();
      });
    });

    it("handles 404 (deleted) repos gracefully in expanded row", async () => {
      const metadataWith404 = {
        ...mockMetadata,
        "virattt/ai-hedge-fund": {
          ...mockMetadata["virattt/ai-hedge-fund"]!,
          error: "not_found",
          description: null,
          stargazers_count: 0,
          language: null,
        },
      };
      vi.mocked(fetchGithubMetadata).mockResolvedValue(metadataWith404);

      renderForge();

      await waitFor(() => {
        expect(screen.getByText("virattt/ai-hedge-fund")).toBeInTheDocument();
      });

      // Click row to expand
      fireEvent.click(screen.getByText("virattt/ai-hedge-fund"));

      await waitFor(() => {
        expect(
          screen.getByText(/repository not found or deleted/i),
        ).toBeInTheDocument();
      });
    });
  });

  describe("Saved Repos Empty State", () => {
    it("shows empty state when no repos", async () => {
      vi.mocked(fetchGithubRepos).mockResolvedValue([]);

      renderForge();

      await waitFor(() => {
        expect(screen.getByText("No saved repos")).toBeInTheDocument();
      });
    });
  });

  describe("Technique Backlog Section", () => {
    it("renders technique groups with domain headings", async () => {
      renderForge();

      await waitFor(() => {
        expect(
          screen.getByText("AI & Machine Learning"),
        ).toBeInTheDocument();
      });
      expect(screen.getByText("Web Development")).toBeInTheDocument();
      expect(screen.getByText("DevOps & Infrastructure")).toBeInTheDocument();
    });

    it("shows count badges for each group", async () => {
      renderForge();

      await waitFor(() => {
        expect(screen.getByText("120 items")).toBeInTheDocument();
      });

      expect(screen.getByText("30 items")).toBeInTheDocument();
      expect(screen.getByText("15 items")).toBeInTheDocument();
    });

    it("displays bookmarks within groups", async () => {
      renderForge();

      await waitFor(() => {
        expect(
          screen.getByText(/RAG techniques for production systems/),
        ).toBeInTheDocument();
      });

      expect(
        screen.getByText(/Fine-tuning LLMs with LoRA/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Modern CSS patterns/),
      ).toBeInTheDocument();
    });

    it("shows author handles for bookmarks", async () => {
      renderForge();

      await waitFor(() => {
        expect(screen.getByText("@LangChain")).toBeInTheDocument();
      });

      expect(screen.getByText("@hwchase17")).toBeInTheDocument();
    });

    it("shows total technique bookmark count", async () => {
      renderForge();

      await waitFor(() => {
        // Total: 120 + 30 + 15 = 165
        expect(screen.getByText("165")).toBeInTheDocument();
      });
    });

    it("shows +more indicator when group has more than displayed", async () => {
      renderForge();

      await waitFor(() => {
        // AI group has 120 count but only 2 bookmarks in the mock, so +118 more
        expect(screen.getByText("+118 more")).toBeInTheDocument();
      });
    });
  });

  describe("Technique Backlog Empty State", () => {
    it("shows empty state when no technique bookmarks", async () => {
      vi.mocked(fetchTechniqueBacklog).mockResolvedValue([]);

      renderForge();

      await waitFor(() => {
        expect(
          screen.getByText("No technique bookmarks"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("Status Toggle", () => {
    it("shows queued status by default for items", async () => {
      renderForge();

      await waitFor(() => {
        const queuedButtons = screen.getAllByText("Queued");
        expect(queuedButtons.length).toBeGreaterThan(0);
      });
    });

    it("cycles through statuses on click: queued → in-progress → done", async () => {
      renderForge();

      await waitFor(() => {
        expect(screen.getAllByText("Queued").length).toBeGreaterThan(0);
      });

      // Click the first Queued button to move to in-progress
      const firstQueued = screen.getAllByText("Queued")[0]!;
      fireEvent.click(firstQueued);

      await waitFor(() => {
        expect(screen.getByText("In Progress")).toBeInTheDocument();
      });

      // Click again to move to done
      fireEvent.click(screen.getByText("In Progress"));

      await waitFor(() => {
        expect(screen.getByText("Done")).toBeInTheDocument();
      });

      // Click again to cycle back to queued
      fireEvent.click(screen.getByText("Done"));

      await waitFor(() => {
        // Should have more Queued buttons again
        expect(screen.getAllByText("Queued").length).toBeGreaterThan(0);
      });
    });

    it("persists status in localStorage", async () => {
      renderForge();

      await waitFor(() => {
        expect(screen.getAllByText("Queued").length).toBeGreaterThan(0);
      });

      // Click first queued to toggle
      const firstQueued = screen.getAllByText("Queued")[0]!;
      fireEvent.click(firstQueued);

      await waitFor(() => {
        expect(screen.getByText("In Progress")).toBeInTheDocument();
      });

      // Check localStorage was updated
      const stored = localStorage.getItem("forge-item-status");
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!) as Record<string, string>;
      const values = Object.values(parsed);
      expect(values).toContain("in-progress");
    });

    it("restores status from localStorage on mount", async () => {
      // Pre-populate localStorage
      localStorage.setItem(
        "forge-item-status",
        JSON.stringify({
          "repo:virattt/ai-hedge-fund": "done",
          "technique:1001": "in-progress",
        }),
      );

      renderForge();

      await waitFor(() => {
        expect(screen.getByText("Done")).toBeInTheDocument();
        expect(screen.getByText("In Progress")).toBeInTheDocument();
      });
    });
  });

  describe("Data Fetching", () => {
    it("calls all three API functions on mount", async () => {
      renderForge();

      await waitFor(() => {
        expect(fetchGithubRepos).toHaveBeenCalledTimes(1);
        expect(fetchGithubMetadata).toHaveBeenCalledTimes(1);
        expect(fetchTechniqueBacklog).toHaveBeenCalledTimes(1);
      });
    });

    it("handles API errors gracefully", async () => {
      vi.mocked(fetchGithubRepos).mockRejectedValue(new Error("API error"));
      vi.mocked(fetchGithubMetadata).mockRejectedValue(new Error("API error"));
      vi.mocked(fetchTechniqueBacklog).mockRejectedValue(
        new Error("API error"),
      );

      renderForge();

      // Should not crash
      await waitFor(() => {
        expect(screen.getByText("Forge")).toBeInTheDocument();
      });
    });
  });
});
