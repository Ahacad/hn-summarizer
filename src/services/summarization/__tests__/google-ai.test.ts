import { GoogleAISummarizer } from "../google-ai";
import { ENV } from "../../../config/environment";
import { API } from "../../../config/constants";

// Mock environment
jest.mock("../../../config/environment", () => ({
  ENV: {
    get: jest.fn().mockImplementation((key) => {
      if (key === "GOOGLE_AI_API_KEY") return "test-api-key";
      return null;
    }),
  },
}));

// Mock Google Generative AI
jest.mock("@google/generative-ai");

describe("GoogleAISummarizer", () => {
  let summarizer: GoogleAISummarizer;

  beforeEach(() => {
    jest.clearAllMocks();
    summarizer = new GoogleAISummarizer("test-api-key");
  });

  describe("constructor", () => {
    it("should initialize with provided API key", () => {
      const custom = new GoogleAISummarizer("custom-key");
      expect(custom).toBeDefined();
    });

    it("should use API key from environment if not provided", () => {
      const envKey = new GoogleAISummarizer();
      expect(ENV.get).toHaveBeenCalledWith("GOOGLE_AI_API_KEY");
      expect(envKey).toBeDefined();
    });

    it("should throw if no API key is available", () => {
      // Mock ENV.get to return null
      (ENV.get as jest.Mock).mockImplementationOnce(() => null);

      expect(() => new GoogleAISummarizer()).toThrow(
        "Google AI API key is required",
      );
    });
  });

  describe("summarize", () => {
    it("should generate a summary successfully", async () => {
      // Call the method
      const summary = await summarizer.summarize(
        12345,
        "Test Article",
        "This is the content of the test article.",
      );

      // Verify the result
      expect(summary).toBeDefined();
      expect(summary.storyId).toBe(12345);
      expect(summary.summary).toBeDefined();
      expect(summary.model).toBe(API.GOOGLE_AI.DEFAULT_MODEL);
      expect(summary.generatedAt).toBeDefined();
    });

    it("should parse structured summary response", async () => {
      // Call the method
      const summary = await summarizer.summarize(
        12345,
        "Test Article",
        "This is the content of the test article.",
      );

      // Verify the structured data was parsed
      expect(summary.summary).toBeDefined();
      expect(summary.shortSummary).toBeDefined();
      expect(summary.keyPoints).toBeInstanceOf(Array);
      expect(summary.topics).toBeInstanceOf(Array);
    });

    it("should estimate reading time correctly", async () => {
      // Create content with approximately 450 words (2 minutes at 225 WPM)
      const words = Array(450).fill("word").join(" ");

      // Call the method
      const summary = await summarizer.summarize(12345, "Test Article", words);

      // Verify the reading time is approximately 2 minutes
      expect(summary.estimatedReadingTime).toBe(2);
    });

    it("should truncate very long content", async () => {
      // Create very long content
      const longContent = "a".repeat(API.GOOGLE_AI.MAX_CONTENT_CHARS + 1000);

      // Call the method
      const summary = await summarizer.summarize(
        12345,
        "Test Article",
        longContent,
      );

      // Verify we still get a summary
      expect(summary).toBeDefined();
      expect(summary.summary).toBeDefined();
    });

    it("should handle API errors gracefully", async () => {
      // Mock getGenerativeModel to throw
      const GoogleGenerativeAI =
        require("@google/generative-ai").GoogleGenerativeAI;
      const mockGenerateContent = jest
        .fn()
        .mockRejectedValue(new Error("API error"));

      GoogleGenerativeAI.prototype.getGenerativeModel.mockImplementationOnce(
        () => ({
          generateContent: mockGenerateContent,
        }),
      );

      // Expect the method to throw
      await expect(
        summarizer.summarize(12345, "Test Article", "Content"),
      ).rejects.toThrow("API error");
    });
  });

  describe("parseSummaryResponse", () => {
    it("should handle responses that don't match the expected format", async () => {
      // Mock getGenerativeModel to return unstructured text
      const GoogleGenerativeAI =
        require("@google/generative-ai").GoogleGenerativeAI;
      const mockGenerateContent = jest.fn().mockResolvedValue({
        response: {
          text: () => "This is just plain text without any structured format.",
        },
      });

      GoogleGenerativeAI.prototype.getGenerativeModel.mockImplementationOnce(
        () => ({
          generateContent: mockGenerateContent,
        }),
      );

      // Call the method
      const summary = await summarizer.summarize(
        12345,
        "Test Article",
        "Content",
      );

      // Verify we still get a summary
      expect(summary).toBeDefined();
      expect(summary.summary).toBe(
        "This is just plain text without any structured format.",
      );
      expect(summary.shortSummary).toBeUndefined();
      expect(summary.keyPoints).toBeUndefined();
    });
  });
});
