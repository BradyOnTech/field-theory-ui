import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { useKeyboardShortcuts } from "../use-keyboard-shortcuts";
import { useListKeyboardNav } from "../use-list-keyboard-nav";
import { KeyboardHelpOverlay } from "@/components/keyboard-help-overlay";

// Helper component to test useKeyboardShortcuts hook
function TestShortcutsHost({
  onHelpToggle,
}: {
  onHelpToggle?: (open: boolean) => void;
}) {
  const { isHelpOpen, setIsHelpOpen } = useKeyboardShortcuts();

  // Notify parent of help state changes
  if (onHelpToggle) {
    onHelpToggle(isHelpOpen);
  }

  return (
    <div>
      <input id="stream-search" data-testid="search-input" type="text" placeholder="Search..." />
      <input data-testid="chat-input" type="text" placeholder="Chat..." />
      <span data-testid="help-state">{isHelpOpen ? "open" : "closed"}</span>
      <button data-testid="close-help" onClick={() => setIsHelpOpen(false)}>
        Close
      </button>
      {isHelpOpen && (
        <KeyboardHelpOverlay onClose={() => setIsHelpOpen(false)} />
      )}
    </div>
  );
}

// Helper component to test useListKeyboardNav hook
function TestListHost({
  itemCount,
  onOpen,
}: {
  itemCount: number;
  onOpen?: (index: number) => void;
}) {
  const { selectedIndex } = useListKeyboardNav({
    itemCount,
    onOpen,
  });

  return (
    <div>
      <span data-testid="selected-index">{selectedIndex}</span>
      {Array.from({ length: itemCount }).map((_, i) => (
        <div
          key={i}
          data-testid={`item-${i}`}
          className={i === selectedIndex ? "selected" : ""}
        >
          Item {i}
        </div>
      ))}
    </div>
  );
}

function renderWithRouter(
  ui: React.ReactElement,
  { route = "/" }: { route?: string } = {},
) {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}

describe("useKeyboardShortcuts", () => {
  describe("/ focuses search", () => {
    it("focuses the search input when / is pressed on /stream", () => {
      render(
        <MemoryRouter initialEntries={["/stream"]}>
          <Routes>
            <Route path="/stream" element={<TestShortcutsHost />} />
          </Routes>
        </MemoryRouter>,
      );
      const searchInput = screen.getByTestId("search-input");

      fireEvent.keyDown(document, { key: "/" });

      expect(document.activeElement).toBe(searchInput);
    });

    it("navigates to /stream when / is pressed from a non-stream view", () => {
      render(
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/" element={<TestShortcutsHost />} />
            <Route
              path="/stream"
              element={<div data-testid="stream-view">Stream</div>}
            />
          </Routes>
        </MemoryRouter>,
      );

      fireEvent.keyDown(document, { key: "/" });

      // After pressing /, the router should navigate to /stream
      expect(screen.getByTestId("stream-view")).toBeInTheDocument();
    });

    it("does not focus search when help overlay is open", () => {
      render(
        <MemoryRouter initialEntries={["/stream"]}>
          <Routes>
            <Route path="/stream" element={<TestShortcutsHost />} />
          </Routes>
        </MemoryRouter>,
      );
      const searchInput = screen.getByTestId("search-input");

      // Open help first
      fireEvent.keyDown(document, { key: "?" });

      // Now try /
      fireEvent.keyDown(document, { key: "/" });

      expect(document.activeElement).not.toBe(searchInput);
    });
  });

  describe("? help overlay", () => {
    it("opens help overlay when ? is pressed", () => {
      renderWithRouter(<TestShortcutsHost />);

      expect(screen.getByTestId("help-state").textContent).toBe("closed");

      fireEvent.keyDown(document, { key: "?" });

      expect(screen.getByTestId("help-state").textContent).toBe("open");
    });

    it("closes help overlay when Esc is pressed", () => {
      renderWithRouter(<TestShortcutsHost />);

      // Open help
      fireEvent.keyDown(document, { key: "?" });
      expect(screen.getByTestId("help-state").textContent).toBe("open");

      // Close help
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.getByTestId("help-state").textContent).toBe("closed");
    });
  });

  describe("Shortcut suppression in inputs", () => {
    it("does not trigger shortcuts when typing in text input", () => {
      renderWithRouter(<TestShortcutsHost />);
      const chatInput = screen.getByTestId("chat-input");

      // Focus the input
      chatInput.focus();

      // Press ? while in input -- should not open help
      fireEvent.keyDown(chatInput, { key: "?" });
      expect(screen.getByTestId("help-state").textContent).toBe("closed");
    });

    it("Esc works in input fields", () => {
      renderWithRouter(<TestShortcutsHost />);

      // Open help first
      fireEvent.keyDown(document, { key: "?" });
      expect(screen.getByTestId("help-state").textContent).toBe("open");

      // Focus input
      const chatInput = screen.getByTestId("chat-input");
      chatInput.focus();

      // Esc should still close help
      fireEvent.keyDown(chatInput, { key: "Escape" });
      expect(screen.getByTestId("help-state").textContent).toBe("closed");
    });
  });

  describe("Escape on detail routes", () => {
    it("navigates back when Escape is pressed on a detail route like /people/LangChain", () => {
      const historyBackSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});

      render(
        <MemoryRouter initialEntries={["/people/LangChain"]}>
          <Routes>
            <Route path="/people/:handle" element={<TestShortcutsHost />} />
          </Routes>
        </MemoryRouter>,
      );

      fireEvent.keyDown(document, { key: "Escape" });

      expect(historyBackSpy).toHaveBeenCalled();
      historyBackSpy.mockRestore();
    });

    it("does not navigate when Escape is pressed on a top-level route like /stream", () => {
      const historyBackSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});

      render(
        <MemoryRouter initialEntries={["/stream"]}>
          <Routes>
            <Route path="/stream" element={<TestShortcutsHost />} />
          </Routes>
        </MemoryRouter>,
      );

      fireEvent.keyDown(document, { key: "Escape" });

      expect(historyBackSpy).not.toHaveBeenCalled();
      historyBackSpy.mockRestore();
    });

    it("does not navigate when Escape is pressed on the root route /", () => {
      const historyBackSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});

      renderWithRouter(<TestShortcutsHost />, { route: "/" });

      fireEvent.keyDown(document, { key: "Escape" });

      expect(historyBackSpy).not.toHaveBeenCalled();
      historyBackSpy.mockRestore();
    });

    it("still closes overlays before checking route", () => {
      const historyBackSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});

      renderWithRouter(<TestShortcutsHost />, { route: "/stream" });

      // Add a mock overlay element
      const overlay = document.createElement("div");
      overlay.setAttribute("data-overlay-open", "true");
      document.body.appendChild(overlay);

      fireEvent.keyDown(document, { key: "Escape" });

      expect(historyBackSpy).toHaveBeenCalled();

      document.body.removeChild(overlay);
      historyBackSpy.mockRestore();
    });
  });

  describe("Number key view switching", () => {
    it("navigates to Observatory when 1 is pressed", () => {
      render(
        <MemoryRouter initialEntries={["/stream"]}>
          <Routes>
            <Route
              path="/stream"
              element={<TestShortcutsHost />}
            />
            <Route
              path="/"
              element={<div data-testid="observatory">Observatory</div>}
            />
          </Routes>
        </MemoryRouter>,
      );

      fireEvent.keyDown(document, { key: "1" });

      // After pressing 1, the router should navigate to /
      expect(screen.getByTestId("observatory")).toBeInTheDocument();
    });

    it("does not trigger number shortcuts in input fields", () => {
      renderWithRouter(<TestShortcutsHost />);
      const chatInput = screen.getByTestId("chat-input");
      chatInput.focus();

      // Press 2 while in input
      fireEvent.keyDown(chatInput, { key: "2" });

      // Should not trigger navigation (help state should remain unchanged)
      expect(screen.getByTestId("help-state").textContent).toBe("closed");
    });
  });
});

describe("useListKeyboardNav", () => {
  describe("j/k navigation", () => {
    it("starts with no selection (-1)", () => {
      renderWithRouter(<TestListHost itemCount={5} />);
      expect(screen.getByTestId("selected-index").textContent).toBe("-1");
    });

    it("selects first item when j is pressed", () => {
      renderWithRouter(<TestListHost itemCount={5} />);

      fireEvent.keyDown(document, { key: "j" });

      expect(screen.getByTestId("selected-index").textContent).toBe("0");
    });

    it("moves selection down with j", () => {
      renderWithRouter(<TestListHost itemCount={5} />);

      fireEvent.keyDown(document, { key: "j" });
      fireEvent.keyDown(document, { key: "j" });

      expect(screen.getByTestId("selected-index").textContent).toBe("1");
    });

    it("moves selection up with k", () => {
      renderWithRouter(<TestListHost itemCount={5} />);

      // Go down twice
      fireEvent.keyDown(document, { key: "j" });
      fireEvent.keyDown(document, { key: "j" });
      fireEvent.keyDown(document, { key: "j" });

      // Go up once
      fireEvent.keyDown(document, { key: "k" });

      expect(screen.getByTestId("selected-index").textContent).toBe("1");
    });

    it("stays at last item when j is pressed at bottom", () => {
      renderWithRouter(<TestListHost itemCount={3} />);

      // Press j 10 times (more than item count)
      for (let i = 0; i < 10; i++) {
        fireEvent.keyDown(document, { key: "j" });
      }

      expect(screen.getByTestId("selected-index").textContent).toBe("2");
    });

    it("stays at first item when k is pressed at top", () => {
      renderWithRouter(<TestListHost itemCount={3} />);

      // Go to first item
      fireEvent.keyDown(document, { key: "j" });
      expect(screen.getByTestId("selected-index").textContent).toBe("0");

      // Try to go up
      fireEvent.keyDown(document, { key: "k" });

      expect(screen.getByTestId("selected-index").textContent).toBe("0");
    });

    it("does not respond to j/k when input is focused", () => {
      render(
        <MemoryRouter>
          <div>
            <input data-testid="text-input" type="text" />
            <TestListHost itemCount={5} />
          </div>
        </MemoryRouter>,
      );

      const input = screen.getByTestId("text-input");
      input.focus();

      fireEvent.keyDown(input, { key: "j" });

      expect(screen.getByTestId("selected-index").textContent).toBe("-1");
    });
  });

  describe("o key opens item", () => {
    it("calls onOpen with selected index when o is pressed", () => {
      const onOpen = vi.fn();
      renderWithRouter(<TestListHost itemCount={5} onOpen={onOpen} />);

      // Select first item
      fireEvent.keyDown(document, { key: "j" });
      // Press o
      fireEvent.keyDown(document, { key: "o" });

      expect(onOpen).toHaveBeenCalledWith(0);
    });

    it("does not call onOpen when nothing is selected", () => {
      const onOpen = vi.fn();
      renderWithRouter(<TestListHost itemCount={5} onOpen={onOpen} />);

      // Press o without selecting
      fireEvent.keyDown(document, { key: "o" });

      expect(onOpen).not.toHaveBeenCalled();
    });
  });
});

describe("KeyboardHelpOverlay", () => {
  it("renders all shortcut descriptions", () => {
    const onClose = vi.fn();
    renderWithRouter(<KeyboardHelpOverlay onClose={onClose} />);

    // Check that shortcuts are listed
    expect(screen.getByText(/Search/i)).toBeInTheDocument();
    expect(screen.getByText(/Help/i)).toBeInTheDocument();
  });

  it("calls onClose when Esc is pressed", () => {
    const onClose = vi.fn();
    renderWithRouter(<KeyboardHelpOverlay onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    renderWithRouter(<KeyboardHelpOverlay onClose={onClose} />);

    const backdrop = screen.getByTestId("help-overlay-backdrop");
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalled();
  });
});
