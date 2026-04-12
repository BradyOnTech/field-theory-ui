import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PeopleView } from "../people";

// Mock window.scrollTo for jsdom
vi.stubGlobal("scrollTo", vi.fn());

// Mock the API module
vi.mock("@/lib/api", () => ({
  fetchTopAuthors: vi.fn(),
}));

import { fetchTopAuthors } from "@/lib/api";

const mockAuthors = [
  {
    author_handle: "LangChain",
    author_name: "LangChain",
    author_profile_image_url:
      "https://pbs.twimg.com/profile_images/123/avatar_normal.jpg",
    count: 326,
    primary_domain: "ai",
    categories: [
      { name: "tool", count: 207 },
      { name: "technique", count: 178 },
    ],
  },
  {
    author_handle: "hwchase17",
    author_name: "Harrison Chase",
    author_profile_image_url:
      "https://pbs.twimg.com/profile_images/456/avatar_normal.jpg",
    count: 185,
    primary_domain: "ai",
    categories: [
      { name: "tool", count: 88 },
      { name: "technique", count: 84 },
    ],
  },
  {
    author_handle: "GitMaxd",
    author_name: "Git Maxd",
    author_profile_image_url:
      "https://pbs.twimg.com/profile_images/789/avatar_normal.jpg",
    count: 172,
    primary_domain: "ai",
    categories: [
      { name: "technique", count: 103 },
      { name: "tool", count: 99 },
    ],
  },
  {
    author_handle: "user4",
    author_name: "User Four",
    author_profile_image_url: "",
    count: 50,
    primary_domain: "web",
    categories: [{ name: "tool", count: 50 }],
  },
  {
    author_handle: "user5",
    author_name: "User Five",
    author_profile_image_url:
      "https://pbs.twimg.com/profile_images/broken/image.jpg",
    count: 30,
    primary_domain: "devops",
    categories: [{ name: "technique", count: 30 }],
  },
];

// Generate a large list for pagination tests
function generateManyAuthors(count: number) {
  const authors = [...mockAuthors];
  for (let i = authors.length; i < count; i++) {
    authors.push({
      author_handle: `author_${i}`,
      author_name: `Author ${i}`,
      author_profile_image_url: "",
      count: Math.max(1, count - i),
      primary_domain: "ai",
      categories: [{ name: "tool", count: 1 }],
    });
  }
  return authors;
}

function renderPeople(initialEntries = ["/people"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <PeopleView />
    </MemoryRouter>,
  );
}

describe("PeopleView", () => {
  beforeEach(() => {
    vi.mocked(fetchTopAuthors).mockResolvedValue(mockAuthors);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Grid Rendering", () => {
    it("renders author cards sorted by bookmark count descending", async () => {
      renderPeople();

      await waitFor(() => {
        expect(screen.getByText("@LangChain")).toBeInTheDocument();
      });

      expect(screen.getByText("@hwchase17")).toBeInTheDocument();
      expect(screen.getByText("@GitMaxd")).toBeInTheDocument();

      // Verify sort order by checking DOM order
      const cards = screen.getAllByTestId("author-card");
      expect(cards.length).toBe(5);
      expect(cards[0]).toHaveTextContent("@LangChain");
      expect(cards[1]).toHaveTextContent("@hwchase17");
      expect(cards[2]).toHaveTextContent("@GitMaxd");
    });

    it("shows top 3 authors with correct counts", async () => {
      renderPeople();

      await waitFor(() => {
        expect(screen.getByText("326")).toBeInTheDocument();
      });

      expect(screen.getByText("185")).toBeInTheDocument();
      expect(screen.getByText("172")).toBeInTheDocument();
    });

    it("calls fetchTopAuthors with a large limit to get all authors", async () => {
      renderPeople();

      await waitFor(() => {
        expect(fetchTopAuthors).toHaveBeenCalledWith(10000);
      });
    });
  });

  describe("Author Card Data Fields", () => {
    it("displays avatar image for authors with profile image URL", async () => {
      renderPeople();

      await waitFor(() => {
        expect(screen.getByText("@LangChain")).toBeInTheDocument();
      });

      const avatarImages = screen.getAllByRole("img");
      expect(avatarImages.length).toBeGreaterThan(0);
    });

    it("displays placeholder fallback for missing avatar", async () => {
      renderPeople();

      await waitFor(() => {
        expect(screen.getByText("@user4")).toBeInTheDocument();
      });

      // user4 has empty author_profile_image_url - should show fallback initial "U"
      expect(screen.getByText("U")).toBeInTheDocument();
    });

    it("displays handle for each author", async () => {
      renderPeople();

      await waitFor(() => {
        expect(screen.getByText("@LangChain")).toBeInTheDocument();
      });

      expect(screen.getByText("@hwchase17")).toBeInTheDocument();
      expect(screen.getByText("@GitMaxd")).toBeInTheDocument();
    });

    it("displays author name when different from handle", async () => {
      renderPeople();

      await waitFor(() => {
        expect(screen.getByText("Harrison Chase")).toBeInTheDocument();
      });

      expect(screen.getByText("Git Maxd")).toBeInTheDocument();
      // LangChain name matches handle, so separate name display is skipped
      // but handle is still shown
      expect(screen.getByText("@LangChain")).toBeInTheDocument();
    });

    it("displays bookmark count", async () => {
      renderPeople();

      await waitFor(() => {
        expect(screen.getByText("326")).toBeInTheDocument();
      });

      expect(screen.getByText("185")).toBeInTheDocument();
      expect(screen.getByText("172")).toBeInTheDocument();
    });

    it("displays primary domain badge", async () => {
      renderPeople();

      await waitFor(() => {
        expect(screen.getByText("@LangChain")).toBeInTheDocument();
      });

      // Multiple authors have "ai" domain
      const aiBadges = screen.getAllByText("ai");
      expect(aiBadges.length).toBeGreaterThanOrEqual(1);
      
      expect(screen.getByText("web")).toBeInTheDocument();
      expect(screen.getByText("devops")).toBeInTheDocument();
    });
  });

  describe("Search/Filter", () => {
    it("renders a search input", async () => {
      renderPeople();

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search authors/i)).toBeInTheDocument();
      });
    });

    it("filters authors by handle when typing 'lang'", async () => {
      renderPeople();

      await waitFor(() => {
        expect(screen.getByText("@LangChain")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search authors/i);
      fireEvent.change(searchInput, { target: { value: "lang" } });

      await waitFor(() => {
        expect(screen.getByText("@LangChain")).toBeInTheDocument();
        expect(screen.queryByText("@hwchase17")).not.toBeInTheDocument();
        expect(screen.queryByText("@GitMaxd")).not.toBeInTheDocument();
      });
    });

    it("filters authors by name", async () => {
      renderPeople();

      await waitFor(() => {
        expect(screen.getByText("@hwchase17")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search authors/i);
      fireEvent.change(searchInput, { target: { value: "harrison" } });

      await waitFor(() => {
        expect(screen.getByText("@hwchase17")).toBeInTheDocument();
        expect(screen.queryByText("@LangChain")).not.toBeInTheDocument();
      });
    });

    it("shows empty state for nonsense search", async () => {
      renderPeople();

      await waitFor(() => {
        expect(screen.getByText("@LangChain")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search authors/i);
      fireEvent.change(searchInput, { target: { value: "xyzzynonexistent999" } });

      await waitFor(() => {
        expect(screen.getByText(/no authors found/i)).toBeInTheDocument();
      });
    });

    it("search is case-insensitive", async () => {
      renderPeople();

      await waitFor(() => {
        expect(screen.getByText("@LangChain")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search authors/i);
      fireEvent.change(searchInput, { target: { value: "LANG" } });

      await waitFor(() => {
        expect(screen.getByText("@LangChain")).toBeInTheDocument();
      });
    });

    it("restores full grid when search is cleared", async () => {
      renderPeople();

      await waitFor(() => {
        expect(screen.getByText("@LangChain")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search authors/i);
      fireEvent.change(searchInput, { target: { value: "lang" } });

      await waitFor(() => {
        expect(screen.queryByText("@hwchase17")).not.toBeInTheDocument();
      });

      fireEvent.change(searchInput, { target: { value: "" } });

      await waitFor(() => {
        expect(screen.getByText("@hwchase17")).toBeInTheDocument();
        expect(screen.getByText("@LangChain")).toBeInTheDocument();
      });
    });
  });

  describe("Pagination", () => {
    it("paginates when there are many authors", async () => {
      const manyAuthors = generateManyAuthors(100);
      vi.mocked(fetchTopAuthors).mockResolvedValue(manyAuthors);

      renderPeople();

      await waitFor(() => {
        expect(screen.getByText("@LangChain")).toBeInTheDocument();
      });

      // Should not show all 100 authors at once - should be paginated
      const cards = screen.getAllByTestId("author-card");
      expect(cards.length).toBeLessThan(100);
      expect(cards.length).toBeGreaterThan(0);
    });

    it("shows pagination controls for navigating pages", async () => {
      const manyAuthors = generateManyAuthors(100);
      vi.mocked(fetchTopAuthors).mockResolvedValue(manyAuthors);

      renderPeople();

      await waitFor(() => {
        expect(screen.getByText("@LangChain")).toBeInTheDocument();
      });

      // Should show page navigation
      expect(screen.getByText(/next/i)).toBeInTheDocument();
    });

    it("navigates to next page and shows different authors", async () => {
      const manyAuthors = generateManyAuthors(100);
      vi.mocked(fetchTopAuthors).mockResolvedValue(manyAuthors);

      renderPeople();

      await waitFor(() => {
        expect(screen.getByText("@LangChain")).toBeInTheDocument();
      });

      const firstPageCards = screen.getAllByTestId("author-card");
      const firstPageFirstCardText = firstPageCards[0]?.textContent;

      // Click next page
      fireEvent.click(screen.getByText(/next/i));

      await waitFor(() => {
        const nextPageCards = screen.getAllByTestId("author-card");
        // The first card on next page should be different
        expect(nextPageCards[0]?.textContent).not.toBe(firstPageFirstCardText);
      });
    });
  });

  describe("Author Count Display", () => {
    it("shows total number of authors", async () => {
      renderPeople();

      await waitFor(() => {
        expect(screen.getByText(/5 authors/i)).toBeInTheDocument();
      });
    });
  });
});
