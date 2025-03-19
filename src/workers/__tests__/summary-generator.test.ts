import { summaryGeneratorHandler } from "../summary-generator";
import { GoogleAISummarizer } from "../../services/summarization/google-ai";
import { StoryRepository } from "../../storage/d1/story-repository";
import { ContentRepository } from "../../storage/r2/content-repository";
import { HackerNewsClient } from "../../services/hackernews/client";
import { ProcessingStatus } from "../../types/story";
import { ENV } from "../../config/environment";
import { logger } from "../../utils/logger";

// Mock dependencies
jest.mock("../../services/summarization/google-ai");
jest.mock("../../storage/d1/story-repository");
jest.mock("../../storage/r2/content-repository");
jest.mock("../../services/hackernews/client");
jest.mock("../../config/environment", () => ({
  ENV: {
    get: jest.fn(),
  },
}));
jest.mock("../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe("Summary Generator Worker", () => {
  // Mock implementations
  const mockSummarize = jest.fn();
  const mockGetStoriesByStatus = jest.fn();
  const mockUpdateStatus = jest.fn();
  const mockUpdateSummaryId = jest.fn();
  const mockGetContent = jest.fn();
  const mockSaveSummary = jest.fn();
  const mockGetStory = jest.fn();

  // Test data
  const mockStories = [
    {
      id: 1,
      title: "Test Story 1",
      url: "https://example.com/article-1",
      by: "user1",
      time: 1645500001,
      score: 101,
      status: ProcessingStatus.EXTRACTED,
      contentId: "content/1/123456",
      processedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 2,
      title: "Test Story 2",
      url: "https://example.com/article-2",
      by: "user2",
      time: 1645500002,
      score: 102,
      status: ProcessingStatus.EXTRACTED,
      contentId: "content/2/123456",
      processedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 3,
      title: "Test Story 3 (No Content ID)",
      url: "https://example.com/article-3",
      by: "user3",
      time: 1645500003,
      score: 103,
      status: ProcessingStatus.EXTRACTED,
      contentId: null, // No content ID
      processedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const mockContent = {
    url: "https://example.com/article-1",
    title: "Test Article",
    byline: "Test Author",
    content: "This is the cleaned content for summarization.",
    excerpt: "This is an excerpt.",
    siteName: "Example Site",
    rawContent: "This is the raw content.",
    rawHtml: "<html><body>Test</body></html>",
    wordCount: 7,
    extractedAt: new Date().toISOString(),
  };

  const mockSummary = {
    storyId: 1,
    summary: "This is a summary of the article.",
    shortSummary: "Short summary.",
    keyPoints: ["Point 1", "Point 2"],
    topics: ["Technology", "Science"],
    estimatedReadingTime: 2,
    model: "gemini-2.0-flash",
    inputTokens: 200,
    outputTokens: 100,
    generatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock ENV.get
    (ENV.get as jest.Mock).mockImplementation((key) => {
      if (key === "SUMMARIZATION_MAX_TOKENS") return 2048;
      return null;
    });

    // Set up GoogleAISummarizer mock
    (GoogleAISummarizer as jest.Mock).mockImplementation(() => ({
      summarize: mockSummarize,
    }));

    // Set up StoryRepository mock
    (StoryRepository as jest.Mock).mockImplementation(() => ({
      getStoriesByStatus: mockGetStoriesByStatus,
      updateStatus: mockUpdateStatus,
      updateSummaryId: mockUpdateSummaryId,
    }));

    // Set up ContentRepository mock
    (ContentRepository as jest.Mock).mockImplementation(() => ({
      getContent: mockGetContent,
      saveSummary: mockSaveSummary,
    }));

    // Set up HackerNewsClient mock
    (HackerNewsClient as jest.Mock).mockImplementation(() => ({
      getStory: mockGetStory,
    }));

    // Set default mock return values
    mockGetStoriesByStatus.mockResolvedValue(mockStories);
    mockUpdateStatus.mockResolvedValue(true);
    mockUpdateSummaryId.mockResolvedValue(true);
    mockGetContent.mockResolvedValue(mockContent);
    mockSummarize.mockResolvedValue(mockSummary);
    mockSaveSummary.mockResolvedValue("summary/1/123456");
  });

  it("should generate summaries for extracted stories", async () => {
    // Create test request
    const request = new Request("https://example.com/cron/generate-summaries");

    // Call the handler
    const response = await summaryGeneratorHandler(
      request,
      {},
      new ExecutionContext(),
    );

    // Verify correct initialization
    expect(GoogleAISummarizer).toHaveBeenCalled();
    expect(StoryRepository).toHaveBeenCalled();
    expect(ContentRepository).toHaveBeenCalled();

    // Verify stories were fetched
    expect(mockGetStoriesByStatus).toHaveBeenCalledWith(
      ProcessingStatus.EXTRACTED,
      5,
    );

    // Verify status updates
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      1,
      ProcessingStatus.SUMMARIZING,
    );
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      2,
      ProcessingStatus.SUMMARIZING,
    );

    // Verify content was fetched
    expect(mockGetContent).toHaveBeenCalledWith("content/1/123456");
    expect(mockGetContent).toHaveBeenCalledWith("content/2/123456");

    // Verify summarization was called
    expect(mockSummarize).toHaveBeenCalledTimes(2);

    // Verify summaries were saved
    expect(mockSaveSummary).toHaveBeenCalledTimes(2);

    // Verify story statuses were updated to COMPLETED
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      1,
      ProcessingStatus.COMPLETED,
    );
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      2,
      ProcessingStatus.COMPLETED,
    );

    // Verify response
    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect(responseBody.success).toBe(true);
    expect(responseBody.summarized).toBe(2);
    expect(responseBody.failed).toBe(1); // Story without contentId
  });

  it("should handle missing content ID", async () => {
    // Create test request
    const request = new Request("https://example.com/cron/generate-summaries");

    // Call the handler
    const response = await summaryGeneratorHandler(
      request,
      {},
      new ExecutionContext(),
    );

    // Verify story with missing contentId was marked as failed
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      3,
      ProcessingStatus.FAILED,
      "No content ID available",
    );

    // Verify response
    const responseBody = await response.json();
    expect(responseBody.failed).toBe(1);
  });

  it("should handle content retrieval failures", async () => {
    // Make content retrieval fail for the second story
    mockGetContent
      .mockResolvedValueOnce(mockContent) // First story succeeds
      .mockResolvedValueOnce(null); // Second story fails

    // Create test request
    const request = new Request("https://example.com/cron/generate-summaries");

    // Call the handler
    const response = await summaryGeneratorHandler(
      request,
      {},
      new ExecutionContext(),
    );

    // Verify appropriate status updates
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      1,
      ProcessingStatus.COMPLETED,
    );
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      2,
      ProcessingStatus.FAILED,
      "Failed to retrieve content",
    );

    // Verify only one summary was generated and saved
    expect(mockSummarize).toHaveBeenCalledTimes(1);
    expect(mockSaveSummary).toHaveBeenCalledTimes(1);

    // Verify response
    const responseBody = await response.json();
    expect(responseBody.summarized).toBe(1);
    expect(responseBody.failed).toBe(2); // Story 2 and Story 3
  });

  it("should handle summarization failures", async () => {
    // Make summarization fail for the second story
    mockSummarize
      .mockResolvedValueOnce(mockSummary) // First story succeeds
      .mockRejectedValueOnce(new Error("Summarization error")); // Second story fails

    // Create test request
    const request = new Request("https://example.com/cron/generate-summaries");

    // Call the handler
    const response = await summaryGeneratorHandler(
      request,
      {},
      new ExecutionContext(),
    );

    // Verify appropriate status updates
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      1,
      ProcessingStatus.COMPLETED,
    );
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      2,
      ProcessingStatus.FAILED,
      "Error: Summarization error",
    );

    // Verify only one summary was saved
    expect(mockSaveSummary).toHaveBeenCalledTimes(1);

    // Verify response
    const responseBody = await response.json();
    expect(responseBody.summarized).toBe(1);
    expect(responseBody.failed).toBe(2);
  });

  it("should handle summary saving failures", async () => {
    // Make summary saving fail for the second story
    mockSaveSummary
      .mockResolvedValueOnce("summary/1/123456") // First story succeeds
      .mockResolvedValueOnce(null); // Second story fails

    // Create test request
    const request = new Request("https://example.com/cron/generate-summaries");

    // Call the handler
    const response = await summaryGeneratorHandler(
      request,
      {},
      new ExecutionContext(),
    );

    // Verify appropriate status updates
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      1,
      ProcessingStatus.COMPLETED,
    );
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      2,
      ProcessingStatus.FAILED,
      "Failed to save summary",
    );

    // Verify response
    const responseBody = await response.json();
    expect(responseBody.summarized).toBe(1);
    expect(responseBody.failed).toBe(2);
  });

  it("should handle worker-level errors", async () => {
    // Make the repository throw an error
    mockGetStoriesByStatus.mockRejectedValueOnce(new Error("Database error"));

    // Create test request
    const request = new Request("https://example.com/cron/generate-summaries");

    // Call the handler
    const response = await summaryGeneratorHandler(
      request,
      {},
      new ExecutionContext(),
    );

    // Verify error logging
    expect(logger.error).toHaveBeenCalledWith(
      "Error in summary generator worker",
      expect.any(Object),
    );

    // Verify error response
    expect(response.status).toBe(500);
    const responseBody = await response.json();
    expect(responseBody.success).toBe(false);
    expect(responseBody.error).toBe("Database error");
  });
});
