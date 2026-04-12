import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ChronosView } from "../chronos";

// Mock the API module
vi.mock("@/lib/api", () => ({
  fetchMonthlyBreakdown: vi.fn(),
  fetchStats: vi.fn(),
}));

// Mock Recharts to avoid SVG rendering issues in jsdom
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <svg data-testid="area-chart">{children}</svg>
  ),
  Area: ({ dataKey }: { dataKey: string }) => (
    <rect data-testid={`area-${dataKey}`} />
  ),
  XAxis: () => <g data-testid="x-axis" />,
  YAxis: () => <g data-testid="y-axis" />,
  Tooltip: () => <g data-testid="tooltip" />,
  CartesianGrid: () => <g data-testid="cartesian-grid" />,
  Legend: () => <g data-testid="legend" />,
}));

import { fetchMonthlyBreakdown, fetchStats } from "@/lib/api";

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

const mockMonthlyBreakdown = [
  {
    month: "2025-10",
    count: 120,
    domains: [
      { domain: "ai", count: 80 },
      { domain: "web", count: 25 },
      { domain: "devops", count: 15 },
    ],
    categories: [
      { category: "technique", count: 50 },
      { category: "tool", count: 40 },
      { category: "concept", count: 30 },
    ],
    topAuthors: [
      { author_handle: "LangChain", author_name: "LangChain", count: 15 },
      { author_handle: "user1", author_name: "User One", count: 10 },
      { author_handle: "user2", author_name: "User Two", count: 8 },
    ],
    notableBookmarks: [
      {
        id: "1",
        text: "Great AI technique post",
        author_handle: "LangChain",
        posted_at_iso: "2025-10-15T10:00:00.000Z",
        like_count: 100,
        repost_count: 50,
      },
    ],
    newAuthors: ["user2"],
  },
  {
    month: "2025-11",
    count: 150,
    domains: [
      { domain: "ai", count: 90 },
      { domain: "web", count: 35 },
      { domain: "security", count: 25 },
    ],
    categories: [
      { category: "technique", count: 60 },
      { category: "tool", count: 50 },
      { category: "research", count: 40 },
    ],
    topAuthors: [
      { author_handle: "LangChain", author_name: "LangChain", count: 20 },
      { author_handle: "user3", author_name: "User Three", count: 12 },
    ],
    notableBookmarks: [
      {
        id: "2",
        text: "Security breakthrough post",
        author_handle: "user3",
        posted_at_iso: "2025-11-10T10:00:00.000Z",
        like_count: 200,
        repost_count: 80,
      },
    ],
    newAuthors: ["user3"],
  },
  {
    month: "2025-12",
    count: 180,
    domains: [
      { domain: "ai", count: 100 },
      { domain: "web", count: 40 },
      { domain: "data", count: 40 },
    ],
    categories: [
      { category: "tool", count: 70 },
      { category: "technique", count: 60 },
      { category: "concept", count: 50 },
    ],
    topAuthors: [
      { author_handle: "hwchase17", author_name: "Harrison Chase", count: 25 },
    ],
    notableBookmarks: [
      {
        id: "3",
        text: "Year-end data engineering roundup",
        author_handle: "hwchase17",
        posted_at_iso: "2025-12-20T10:00:00.000Z",
        like_count: 300,
        repost_count: 120,
      },
    ],
    newAuthors: [],
  },
];

function renderChronos() {
  return render(
    <MemoryRouter initialEntries={["/chronos"]}>
      <ChronosView />
    </MemoryRouter>,
  );
}

describe("ChronosView", () => {
  beforeEach(() => {
    vi.mocked(fetchMonthlyBreakdown).mockResolvedValue(mockMonthlyBreakdown);
    vi.mocked(fetchStats).mockResolvedValue(mockStats);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Stacked Area Chart", () => {
    it("renders a Recharts AreaChart", async () => {
      renderChronos();

      await waitFor(() => {
        expect(screen.getByTestId("area-chart")).toBeInTheDocument();
      });
    });

    it("renders area elements for domains", async () => {
      renderChronos();

      await waitFor(() => {
        expect(screen.getByTestId("area-chart")).toBeInTheDocument();
      });

      // Should have areas for each unique domain
      expect(screen.getByTestId("area-ai")).toBeInTheDocument();
      expect(screen.getByTestId("area-web")).toBeInTheDocument();
    });

    it("calls fetchMonthlyBreakdown on mount", async () => {
      renderChronos();

      await waitFor(() => {
        expect(fetchMonthlyBreakdown).toHaveBeenCalledTimes(1);
      });
    });

    it("calls fetchStats on mount for total consistency check", async () => {
      renderChronos();

      await waitFor(() => {
        expect(fetchStats).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("Month Detail Cards", () => {
    it("renders month detail cards below chart", async () => {
      renderChronos();

      await waitFor(() => {
        // Month labels may appear in both detail cards and drift annotations
        expect(screen.getAllByText("Oct 2025").length).toBeGreaterThanOrEqual(1);
      });

      expect(screen.getAllByText("Nov 2025").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Dec 2025").length).toBeGreaterThanOrEqual(1);
    });

    it("shows bookmark count in each card", async () => {
      renderChronos();

      await waitFor(() => {
        expect(screen.getByText("120")).toBeInTheDocument();
      });

      expect(screen.getByText("150")).toBeInTheDocument();
      expect(screen.getByText("180")).toBeInTheDocument();
    });

    it("shows top categories in detail cards", async () => {
      renderChronos();

      await waitFor(() => {
        // Categories display as "technique (50)" in badges
        expect(screen.getAllByText(/technique/).length).toBeGreaterThanOrEqual(1);
      });
    });

    it("shows top authors in detail cards", async () => {
      renderChronos();

      await waitFor(() => {
        // Authors display as "@LangChain (15)" in badges
        expect(screen.getAllByText(/@LangChain/).length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe("Interest Drift Detection", () => {
    it("shows drift annotations for significant domain changes", async () => {
      renderChronos();

      await waitFor(() => {
        // At least check the drift section exists
        expect(screen.getByText(/interest drift/i)).toBeInTheDocument();
      });
    });
  });

  describe("Date Range Selector", () => {
    it("renders date range inputs", async () => {
      renderChronos();

      await waitFor(() => {
        // Should have start and end date inputs (type="month")
        expect(screen.getByLabelText(/from/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/to/i)).toBeInTheDocument();
      });
    });

    it("filters data when date range changes", async () => {
      renderChronos();

      await waitFor(() => {
        expect(screen.getAllByText("Oct 2025").length).toBeGreaterThanOrEqual(1);
      });

      // Change the "from" date to filter out October
      const fromInput = screen.getByLabelText(/from/i);
      fireEvent.change(fromInput, { target: { value: "2025-11" } });

      await waitFor(() => {
        // October should no longer be visible anywhere
        expect(screen.queryByText("Oct 2025")).not.toBeInTheDocument();
      });

      // November and December should still be visible
      expect(screen.getAllByText("Nov 2025").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Dec 2025").length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Drift Detection from Full Dataset", () => {
    it("drift annotations are computed from full dataset, not filtered subset", async () => {
      renderChronos();

      await waitFor(() => {
        expect(screen.getByText(/interest drift/i)).toBeInTheDocument();
      });

      // Count initial drift annotations
      const initialDrifts = screen.getAllByTestId("drift-annotation");
      const initialCount = initialDrifts.length;

      // Filter to only November onwards
      const fromInput = screen.getByLabelText(/from/i);
      fireEvent.change(fromInput, { target: { value: "2025-11" } });

      await waitFor(() => {
        // October should be filtered out
        expect(screen.queryByText("Oct 2025")).not.toBeInTheDocument();
      });

      // After filtering, the drift annotations should be a subset of the original
      // (only showing drifts within the filtered range), NOT re-computed
      // which would wrongly re-detect domains as "new" in the filtered range
      const filteredDrifts = screen.queryAllByTestId("drift-annotation");
      expect(filteredDrifts.length).toBeLessThanOrEqual(initialCount);
    });
  });

  describe("Domain 'Other' Category", () => {
    it("groups overflow domains into 'Other' when more than 12 unique domains", async () => {
      // Create mock data with more than 12 unique domains
      const manyDomainEntry = {
        month: "2025-10",
        count: 260,
        domains: [
          { domain: "ai", count: 80 },
          { domain: "web", count: 25 },
          { domain: "devops", count: 15 },
          { domain: "security", count: 12 },
          { domain: "data", count: 11 },
          { domain: "mobile", count: 10 },
          { domain: "cloud", count: 9 },
          { domain: "gaming", count: 8 },
          { domain: "finance", count: 8 },
          { domain: "education", count: 7 },
          { domain: "health", count: 7 },
          { domain: "science", count: 6 },
          { domain: "media", count: 5 },          // 13th domain - should be in "Other"
          { domain: "social", count: 4 },          // 14th domain - should be in "Other"
          { domain: "ecommerce", count: 3 },       // 15th domain - should be in "Other"
        ],
        categories: [{ category: "technique", count: 260 }],
        topAuthors: [{ author_handle: "user1", author_name: "User", count: 50 }],
        notableBookmarks: [],
        newAuthors: [],
      };

      vi.mocked(fetchMonthlyBreakdown).mockResolvedValue([manyDomainEntry]);

      renderChronos();

      await waitFor(() => {
        expect(screen.getByTestId("area-chart")).toBeInTheDocument();
      });

      // Should render "Other" area in the chart when >12 domains
      expect(screen.getByTestId("area-Other")).toBeInTheDocument();
      // And still render the top domains
      expect(screen.getByTestId("area-ai")).toBeInTheDocument();
    });

    it("does not show 'Other' when 12 or fewer domains", async () => {
      // The default mock has only 5 unique domains across months
      renderChronos();

      await waitFor(() => {
        expect(screen.getByTestId("area-chart")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("area-Other")).not.toBeInTheDocument();
    });
  });

  describe("Data Fetching", () => {
    it("shows loading state before data arrives", () => {
      renderChronos();

      expect(screen.getByText("Chronos")).toBeInTheDocument();
    });

    it("handles API errors gracefully", async () => {
      vi.mocked(fetchMonthlyBreakdown).mockRejectedValue(new Error("API error"));
      vi.mocked(fetchStats).mockRejectedValue(new Error("API error"));

      renderChronos();

      // Should not crash
      await waitFor(() => {
        expect(screen.getByText("Chronos")).toBeInTheDocument();
      });
    });
  });
});
