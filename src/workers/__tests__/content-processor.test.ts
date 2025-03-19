import { contentProcessorHandler } from "../content-processor";
import { ContentExtractor } from "../../services/content/extractor";
import { StoryRepository } from "../../storage/d1/story-repository";
import { ContentRepository } from "../../storage/r2/content-repository";
import { ProcessingStatus } from "../../types/story";
import { logger } from "../../utils/logger";

// Mock dependencies
jest.mock("../../services/content/extractor");
jest.mock("../../storage/d1/story-repository");
jest.mock("../../storage/r2/content-repository");
jest.mock("../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe("Content Processor Worker", () => {
  // Mock implementations
  const mockExtract = jest.fn();
  const mockGetStoriesByStatus = jest.fn();
  const mockUpdateStatus = jest.fn();
  const mockUpdateContentId = jest.fn();
  const mockSaveContent = jest.fn();

  // Test data
  const mockStories = [
    {
      id: 1,
      title: "Test Story 1",
      url: "https://example.com/article-1",
      by: "user1",
      time: 1645500001,
      score: 101,
      status: ProcessingStatus.PENDING,
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
      status: ProcessingStatus.PENDING,
      processedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 3, // Story without URL
      title: "Test Story 3",
      url: null,
      by: "user3",
      time: 1645500003,
      score: 103,
      status: ProcessingStatus.PENDING,
      processedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const mockContent = {
    url: "https://example.com/article-1",
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

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Set up ContentExtractor mock
    (ContentExtractor as jest.Mock).mockImplementation(() => ({
      extract: mockExtract,
    }));

    // Set up StoryRepository mock
    (StoryRepository as jest.Mock).mockImplementation(() => ({
      getStoriesByStatus: mockGetStoriesByStatus,
      updateStatus: mockUpdateStatus,
      updateContentId: mockUpdateContentId,
    }));

    // Set up ContentRepository mock
    (ContentRepository as jest.Mock).mockImplementation(() => ({
      saveContent: mockSaveContent,
    }));

    // Set default mock return values
    mockGetStoriesByStatus.mockResolvedValue(mockStories);
    mockUpdateStatus.mockResolvedValue(true);
    mockUpdateContentId.mockResolvedValue(true);
    mockExtract.mockResolvedValue(mockContent);
    mockSaveContent.mockResolvedValue("content/1/123456");
  });

  it("should process stories and extract content", async () => {
    // Create test request
    const request = new Request("https://example.com/cron/process-content");

    // Call the handler
    const response = await contentProcessorHandler(
      request,
      {},
      new ExecutionContext(),
    );

    // Verify correct function calls
    expect(ContentExtractor).toHaveBeenCalled();
    expect(StoryRepository).toHaveBeenCalled();
    expect(ContentRepository).toHaveBeenCalled();

    // Verify stories were fetched
    expect(mockGetStoriesByStatus).toHaveBeenCalledWith(
      ProcessingStatus.PENDING,
      10,
    );

    // Verify content extraction for stories with URLs
    expect(mockExtract).toHaveBeenCalledTimes(2); // Only for the 2 stories with URLs
    expect(mockExtract).toHaveBeenCalledWith("https://example.com/article-1");
    expect(mockExtract).toHaveBeenCalledWith("https://example.com/article-2");

    // Verify stories were updated appropriately
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      1,
      ProcessingStatus.EXTRACTING,
    );
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      2,
      ProcessingStatus.EXTRACTING,
    );
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      3,
      ProcessingStatus.FAILED,
      "No URL provided",
    );

    // Verify content was saved
    expect(mockSaveContent).toHaveBeenCalledTimes(2);

    // Verify story status was updated to EXTRACTED
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      1,
      ProcessingStatus.EXTRACTED,
    );
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      2,
      ProcessingStatus.EXTRACTED,
    );

    // Verify response
    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect(responseBody.success).toBe(true);
    expect(responseBody.processed).toBe(2);
    expect(responseBody.failed).toBe(1);
  });

  it("should handle extraction failures", async () => {
    // Make extraction fail for the second story
    mockExtract
      .mockResolvedValueOnce(mockContent) // First story succeeds
      .mockResolvedValueOnce(null); // Second story fails

    // Create test request
    const request = new Request("https://example.com/cron/process-content");

    // Call the handler
    const response = await contentProcessorHandler(
      request,
      {},
      new ExecutionContext(),
    );

    // Verify appropriate status updates
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      1,
      ProcessingStatus.EXTRACTED,
    );
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      2,
      ProcessingStatus.FAILED,
      "Failed to extract content",
    );

    // Verify only one content was saved
    expect(mockSaveContent).toHaveBeenCalledTimes(1);

    // Verify response
    const responseBody = await response.json();
    expect(responseBody.success).toBe(true);
    expect(responseBody.processed).toBe(1);
    expect(responseBody.failed).toBe(2);
  });

  it("should handle content saving failures", async () => {
    // Make content saving fail for the second story
    mockSaveContent
      .mockResolvedValueOnce("content/1/123456") // First story succeeds
      .mockResolvedValueOnce(null); // Second story fails

    // Create test request
    const request = new Request("https://example.com/cron/process-content");

    // Call the handler
    const response = await contentProcessorHandler(
      request,
      {},
      new ExecutionContext(),
    );

    // Verify appropriate status updates
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      1,
      ProcessingStatus.EXTRACTED,
    );
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      2,
      ProcessingStatus.FAILED,
      "Failed to save content",
    );

    // Verify response
    const responseBody = await response.json();
    expect(responseBody.success).toBe(true);
    expect(responseBody.processed).toBe(1);
    expect(responseBody.failed).toBe(2);
  });

  it("should handle unexpected errors", async () => {
    // Make extraction throw an unexpected error
    mockExtract.mockImplementationOnce(() => {
      throw new Error("Unexpected error");
    });

    // Create test request
    const request = new Request("https://example.com/cron/process-content");

    // Call the handler
    const response = await contentProcessorHandler(
      request,
      {},
      new ExecutionContext(),
    );

    // Verify error handling
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      1,
      ProcessingStatus.FAILED,
      "Error: Unexpected error",
    );

    // Verify response
    const responseBody = await response.json();
    expect(responseBody.success).toBe(true);
    // Still 2 failures (story 1 and story 3) and 1 success (story 2)
    expect(responseBody.processed).toBe(1);
    expect(responseBody.failed).toBe(2);
  });

  it("should handle worker-level errors", async () => {
    // Make the repository throw an error
    mockGetStoriesByStatus.mockRejectedValueOnce(new Error("Database error"));

    // Create test request
    const request = new Request("https://example.com/cron/process-content");

    // Call the handler
    const response = await contentProcessorHandler(
      request,
      {},
      new ExecutionContext(),
    );

    // Verify error logging
    expect(logger.error).toHaveBeenCalledWith(
      "Error in content processor worker",
      expect.any(Object),
    );

    // Verify error response
    expect(response.status).toBe(500);
    const responseBody = await response.json();
    expect(responseBody.success).toBe(false);
    expect(responseBody.error).toBe("Database error");
  });
});
