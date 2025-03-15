import { ContentExtractor } from "../extractor";
import { cleaner } from "../cleaner";

// Mock the cleaner
jest.mock("../cleaner", () => ({
  cleaner: {
    clean: jest.fn((text) => text),
  },
}));

// Mock the Readability module
jest.mock("readability", () => {
  return {
    Readability: jest.fn().mockImplementation(() => {
      return {
        parse: jest.fn().mockReturnValue({
          title: "Test Article",
          byline: "Test Author",
          content: "<div>Test Content</div>",
          textContent: "Test Content",
          excerpt: "Test excerpt",
          siteName: "Test Site",
          length: 100,
        }),
      };
    }),
  };
});

// Mock JSDOM
jest.mock("jsdom", () => {
  return {
    JSDOM: jest.fn().mockImplementation((html, options) => {
      return {
        window: {
          document: {
            documentElement: {},
            querySelector: jest.fn(),
          },
        },
      };
    }),
  };
});

describe("ContentExtractor", () => {
  let extractor: ContentExtractor;

  beforeEach(() => {
    // Setup fetch mock
    (fetch as jest.Mock).mockImplementation((url: string) => {
      return Promise.resolve({
        ok: true,
        headers: new Map([["content-type", "text/html"]]),
        text: () =>
          Promise.resolve(
            "<html><body><article>Test content</article></body></html>",
          ),
      });
    });

    // Create a new extractor instance for each test
    extractor = new ContentExtractor();

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe("extract", () => {
    it("should extract content from a URL", async () => {
      // Call the method
      const content = await extractor.extract("https://example.com/article");

      // Verify the result
      expect(content).not.toBeNull();
      expect(content?.url).toBe("https://example.com/article");
      expect(content?.title).toBe("Test Article");
      expect(content?.byline).toBe("Test Author");
      expect(content?.siteName).toBe("Test Site");

      // Verify fetch was called
      expect(fetch).toHaveBeenCalledWith(
        "https://example.com/article",
        expect.objectContaining({
          headers: expect.objectContaining({
            "User-Agent": expect.any(String),
          }),
        }),
      );

      // Verify cleaner was called
      expect(cleaner.clean).toHaveBeenCalled();
    });

    it("should handle fetch errors gracefully", async () => {
      // Override fetch to simulate an error
      (fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.reject(new Error("Network error")),
      );

      // Call the method
      const content = await extractor.extract("https://example.com/article");

      // Verify we get null back
      expect(content).toBeNull();
    });

    it("should handle non-HTML content types gracefully", async () => {
      // Override fetch to return a non-HTML content type
      (fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          headers: new Map([["content-type", "application/pdf"]]),
          text: () => Promise.resolve("PDF content"),
        }),
      );

      // Call the method
      const content = await extractor.extract(
        "https://example.com/document.pdf",
      );

      // Verify we get null back
      expect(content).toBeNull();
    });

    it("should handle readability failures gracefully", async () => {
      // Override Readability to return null
      require("readability").Readability.mockImplementationOnce(() => {
        return {
          parse: jest.fn().mockReturnValue(null),
        };
      });

      // Call the method
      const content = await extractor.extract("https://example.com/article");

      // Verify we get null back
      expect(content).toBeNull();
    });

    it("should handle timeouts gracefully", async () => {
      // Override fetch to simulate a timeout
      jest.useFakeTimers();
      (fetch as jest.Mock).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                ok: true,
                headers: new Map([["content-type", "text/html"]]),
                text: () => Promise.resolve("<html><body>Test</body></html>"),
              });
            }, 20000); // Longer than the timeout
          }),
      );

      // Start the extraction
      const contentPromise = extractor.extract("https://example.com/article");

      // Advance timers to trigger the timeout
      jest.advanceTimersByTime(15000);

      // Verify we get null back
      const content = await contentPromise;
      expect(content).toBeNull();

      jest.useRealTimers();
    });
  });
});
