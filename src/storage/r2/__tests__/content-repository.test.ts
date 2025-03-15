import { ContentRepository } from "../content-repository";
import { ENV } from "../../../config/environment";
import { ExtractedContent } from "../../../types/story";
import { Summary } from "../../../types/summary";
import { MockR2Bucket } from "../../../__mocks__/cloudflare";
import { STORAGE } from "../../../config/constants";

// Mock the ENV module
jest.mock("../../../config/environment", () => ({
  ENV: {
    get: jest.fn(),
  },
}));

describe("ContentRepository", () => {
  let repository: ContentRepository;
  let mockBucket: MockR2Bucket;

  beforeEach(() => {
    // Setup mock R2 bucket
    mockBucket = new MockR2Bucket();

    // Mock ENV.get to return our mock bucket
    (ENV.get as jest.Mock).mockImplementation((key) => {
      if (key === "CONTENT_BUCKET") return mockBucket;
      return null;
    });

    // Create a new repository instance for each test
    repository = new ContentRepository();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("saveContent", () => {
    it("should save extracted content to R2", async () => {
      // Create mock content
      const content: ExtractedContent = {
        url: "https://example.com/article",
        title: "Test Article",
        byline: "Test Author",
        content: "This is the cleaned content.",
        excerpt: "This is an excerpt.",
        siteName: "Example Site",
        rawContent: "This is the raw content.",
        rawHtml: "<html><body>Test</body></html>",
        wordCount: 5,
        extractedAt: new Date().toISOString(),
      };

      // Call the method
      const contentId = await repository.saveContent(30000001, content);

      // Verify the result
      expect(contentId).not.toBeNull();
      expect(contentId).toContain(STORAGE.R2.CONTENT_PREFIX);
      expect(contentId).toContain("30000001");
    });

    it("should handle R2 errors gracefully", async () => {
      // Mock R2Bucket.put to throw
      jest.spyOn(mockBucket, "put").mockImplementationOnce(() => {
        throw new Error("R2 error");
      });

      // Create mock content
      const content: ExtractedContent = {
        url: "https://example.com/article",
        title: "Test Article",
        byline: "Test Author",
        content: "This is the cleaned content.",
        excerpt: "This is an excerpt.",
        siteName: "Example Site",
        rawContent: "This is the raw content.",
        rawHtml: "<html><body>Test</body></html>",
        wordCount: 5,
        extractedAt: new Date().toISOString(),
      };

      // Call the method
      const contentId = await repository.saveContent(30000001, content);

      // Verify we get null back
      expect(contentId).toBeNull();
    });
  });

  describe("getContent", () => {
    it("should retrieve content from R2", async () => {
      // Create and save mock content
      const content: ExtractedContent = {
        url: "https://example.com/article",
        title: "Test Article",
        byline: "Test Author",
        content: "This is the cleaned content.",
        excerpt: "This is an excerpt.",
        siteName: "Example Site",
        rawContent: "This is the raw content.",
        rawHtml: "<html><body>Test</body></html>",
        wordCount: 5,
        extractedAt: new Date().toISOString(),
      };

      const contentId = await repository.saveContent(30000001, content);

      // Retrieve the content
      const retrievedContent = await repository.getContent(contentId!);

      // Verify the result
      expect(retrievedContent).not.toBeNull();
      expect(retrievedContent?.title).toBe("Test Article");
      expect(retrievedContent?.content).toBe("This is the cleaned content.");
    });

    it("should return null for non-existent content", async () => {
      // Retrieve non-existent content
      const content = await repository.getContent("content/nonexistent/123456");

      // Verify we get null back
      expect(content).toBeNull();
    });
  });

  describe("saveSummary", () => {
    it("should save summary to R2", async () => {
      // Create mock summary
      const summary: Summary = {
        storyId: 30000001,
        summary: "This is a summary of the article.",
        shortSummary: "Short summary.",
        keyPoints: ["Point 1", "Point 2"],
        topics: ["Technology", "Science"],
        estimatedReadingTime: 2,
        model: "gemini-2.0-flash",
        inputTokens: 500,
        outputTokens: 200,
        generatedAt: new Date().toISOString(),
      };

      // Call the method
      const summaryId = await repository.saveSummary(30000001, summary);

      // Verify the result
      expect(summaryId).not.toBeNull();
      expect(summaryId).toContain(STORAGE.R2.SUMMARY_PREFIX);
      expect(summaryId).toContain("30000001");
    });
  });

  describe("getSummary", () => {
    it("should retrieve summary from R2", async () => {
      // Create and save mock summary
      const summary: Summary = {
        storyId: 30000001,
        summary: "This is a summary of the article.",
        shortSummary: "Short summary.",
        keyPoints: ["Point 1", "Point 2"],
        topics: ["Technology", "Science"],
        estimatedReadingTime: 2,
        model: "gemini-2.0-flash",
        inputTokens: 500,
        outputTokens: 200,
        generatedAt: new Date().toISOString(),
      };

      const summaryId = await repository.saveSummary(30000001, summary);

      // Retrieve the summary
      const retrievedSummary = await repository.getSummary(summaryId!);

      // Verify the result
      expect(retrievedSummary).not.toBeNull();
      expect(retrievedSummary?.summary).toBe(
        "This is a summary of the article.",
      );
      expect(retrievedSummary?.keyPoints).toEqual(["Point 1", "Point 2"]);
    });
  });

  describe("getLatestContent", () => {
    it("should retrieve the latest content for a story", async () => {
      // Create and save multiple content versions
      const content1: ExtractedContent = {
        url: "https://example.com/article",
        title: "Test Article V1",
        byline: "Test Author",
        content: "Version 1 content.",
        excerpt: "V1 excerpt.",
        siteName: "Example Site",
        rawContent: "Raw v1 content.",
        rawHtml: "<html><body>V1</body></html>",
        wordCount: 3,
        extractedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      };

      const content2: ExtractedContent = {
        url: "https://example.com/article",
        title: "Test Article V2",
        byline: "Test Author",
        content: "Version 2 content.",
        excerpt: "V2 excerpt.",
        siteName: "Example Site",
        rawContent: "Raw v2 content.",
        rawHtml: "<html><body>V2</body></html>",
        wordCount: 3,
        extractedAt: new Date().toISOString(), // Now
      };

      await repository.saveContent(30000001, content1);
      await repository.saveContent(30000001, content2);

      // Retrieve the latest content
      const latestContent = await repository.getLatestContent(30000001);

      // Verify the result
      expect(latestContent).not.toBeNull();
      expect(latestContent?.title).toBe("Test Article V2");
    });

    it("should return null for stories with no content", async () => {
      // Retrieve content for a story with no content
      const content = await repository.getLatestContent(99999);

      // Verify we get null back
      expect(content).toBeNull();
    });
  });

  describe("getLatestSummary", () => {
    it("should retrieve the latest summary for a story", async () => {
      // Create and save multiple summary versions
      const summary1: Summary = {
        storyId: 30000001,
        summary: "Version 1 summary.",
        model: "gemini-2.0-flash",
        inputTokens: 500,
        outputTokens: 100,
        generatedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      };

      const summary2: Summary = {
        storyId: 30000001,
        summary: "Version 2 summary.",
        model: "gemini-2.0-flash",
        inputTokens: 500,
        outputTokens: 120,
        generatedAt: new Date().toISOString(), // Now
      };

      await repository.saveSummary(30000001, summary1);
      await repository.saveSummary(30000001, summary2);

      // Retrieve the latest summary
      const latestSummary = await repository.getLatestSummary(30000001);

      // Verify the result
      expect(latestSummary).not.toBeNull();
      expect(latestSummary?.summary).toBe("Version 2 summary.");
    });
  });
});
