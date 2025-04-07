import { CloudflareClient } from "../cloudflare-client";

describe("CloudflareClient", () => {
  let client: CloudflareClient;

  beforeEach(() => {
    // Setup fetch mock
    (fetch as jest.Mock).mockImplementation((url: string) => {
      return Promise.resolve({
        ok: true,
        headers: new Map([["content-type", "text/html"]]),
        text: () =>
          Promise.resolve(
            `<!DOCTYPE html>
            <html>
              <head>
                <title>Test Article</title>
                <meta name="description" content="Test excerpt">
                <meta property="og:site_name" content="Test Site">
                <meta name="author" content="Test Author">
              </head>
              <body>
                <article>
                  <h1>Test Article</h1>
                  <p>This is test content with some words for testing.</p>
                </article>
              </body>
            </html>`,
          ),
      });
    });

    // Create a new client instance for each test
    client = new CloudflareClient();

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe("extractContent", () => {
    it("should extract content from a URL", async () => {
      // Call the method
      const content = await client.extractContent(
        "https://example.com/article",
      );

      // Verify the result
      expect(content).not.toBeNull();
      expect(content?.url).toBe("https://example.com/article");
      expect(content?.title).toBe("Test Article");
      expect(content?.byline).toBe("Test Author");
      expect(content?.siteName).toBe("Test Site");
      expect(content?.excerpt).toBe("Test excerpt");

      // Verify fetch was called with correct parameters
      expect(fetch).toHaveBeenCalledWith(
        "https://example.com/article",
        expect.objectContaining({
          headers: expect.objectContaining({
            "User-Agent": expect.any(String),
            Accept: expect.any(String),
          }),
          cf: expect.objectContaining({
            cacheTtl: expect.any(Number),
            cacheEverything: expect.any(Boolean),
            scrapeShield: expect.any(Boolean),
          }),
        }),
      );
    });

    it("should handle fetch errors gracefully", async () => {
      // Override fetch to simulate an error
      (fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.reject(new Error("Network error")),
      );

      // Call the method
      const content = await client.extractContent(
        "https://example.com/article",
      );

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
      const content = await client.extractContent(
        "https://example.com/document.pdf",
      );

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
      const contentPromise = client.extractContent(
        "https://example.com/article",
      );

      // Advance timers to trigger the timeout
      jest.advanceTimersByTime(15000);

      // Verify we get null back
      const content = await contentPromise;
      expect(content).toBeNull();

      jest.useRealTimers();
    });

    it("should retry failed requests", async () => {
      // Override fetch to fail on the first attempt, succeed on the second
      (fetch as jest.Mock)
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: false,
            status: 503,
            statusText: "Service Unavailable",
          }),
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            headers: new Map([["content-type", "text/html"]]),
            text: () =>
              Promise.resolve(`
                <!DOCTYPE html>
                <html>
                  <head><title>Test Article</title></head>
                  <body><article>Test content</article></body>
                </html>
              `),
          }),
        );

      // Call the method
      const content = await client.extractContent(
        "https://example.com/article",
      );

      // Verify we still get the content after retry
      expect(content).not.toBeNull();
      expect(content?.title).toBe("Test Article");

      // Verify fetch was called twice
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });
});
