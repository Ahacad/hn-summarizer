/**
 * Google AI Summarization Service (Gemini 2.0)
 *
 * This module provides functions for summarizing content using Google's Gemini AI API.
 * It handles sending text to the Gemini 2.0 model and processing the responses.
 */

import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import { logger } from "../../utils/logger";
import { ENV } from "../../config/environment";
import { Summary } from "../../types/summary";
import { promptTemplates } from "./prompt-templates";
import { HNStoryID } from "../../types/hackernews";
import { API, PROCESSING } from "../../config/constants";

/**
 * Summarization service using Google Gemini AI
 */
export class GoogleAISummarizer {
  private genAI: GoogleGenerativeAI;
  private model: string;
  private maxOutputTokens: number;

  /**
   * Create a new Google AI summarizer
   *
   * @param apiKey Google AI API key
   * @param maxTokens Maximum tokens for the summary
   * @param modelName Model name to use
   */
  constructor(
    apiKey?: string,
    maxTokens = API.GOOGLE_AI.DEFAULT_MAX_TOKENS,
    modelName = API.GOOGLE_AI.DEFAULT_MODEL,
  ) {
    // Get API key from environment if not provided
    const key = apiKey || ENV.get("GOOGLE_AI_API_KEY");

    if (!key) {
      throw new Error("Google AI API key is required");
    }

    this.maxOutputTokens = maxTokens;
    this.model = modelName;

    // Initialize the Google AI client
    this.genAI = new GoogleGenerativeAI(key);
  }

  /**
   * Generate a summary for the given content
   *
   * @param storyId The HackerNews story ID
   * @param title The title of the story
   * @param content The content to summarize
   * @param maxTokens Maximum tokens for the summary
   * @returns The generated summary
   */
  async summarize(
    storyId: HNStoryID,
    title: string,
    content: string,
    maxTokens = 2048,
  ): Promise<Summary> {
    try {
      logger.info("Generating summary", {
        storyId,
        contentLength: content.length,
      });

      // Prepare the prompt
      const prompt = this.preparePrompt(title, content);

      // Track the start time for performance monitoring
      const startTime = Date.now();

      // Get the generative model
      const generativeModel = this.genAI.getGenerativeModel({
        model: this.model,
        generationConfig: {
          maxOutputTokens: maxTokens || this.maxOutputTokens,
          temperature: API.GOOGLE_AI.DEFAULT_TEMPERATURE, // Lower temperature for more focused summaries
          topP: 0.95,
          topK: 40,
        },
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
        ],
      });

      // Generate the summary
      const result = await generativeModel.generateContent(prompt);
      const response = result.response;
      const generatedText = response.text().trim();

      // Track the end time
      const endTime = Date.now();

      // Parse the summary data from the generated text
      const summary = this.parseSummaryResponse(generatedText);

      // Create the summary object
      const res: Summary = {
        storyId,
        summary: summary.summary,
        shortSummary: summary.shortSummary,
        keyPoints: summary.keyPoints,
        topics: summary.topics,
        estimatedReadingTime: this.estimateReadingTime(content),
        model: this.model,
        inputTokens: this.estimateTokenCount(prompt),
        outputTokens: this.estimateTokenCount(generatedText),
        generatedAt: new Date().toISOString(),
        metadata: {
          processingTimeMs: endTime - startTime,
          contentLength: content.length,
          originalTitle: title,
        },
      };

      logger.info("Summary generated successfully", {
        storyId,
        summaryLength: result.summary.length,
        processingTimeMs: endTime - startTime,
      });

      return res;
    } catch (error) {
      logger.error("Error generating summary", { error, storyId });
      throw error;
    }
  }

  /**
   * Prepare the prompt for the LLM
   */
  private preparePrompt(title: string, content: string): string {
    // Truncate content if it's too long
    const truncatedContent = this.truncateContent(content);

    // Format the prompt using the template
    return promptTemplates.summary
      .replace("{{TITLE}}", title)
      .replace("{{CONTENT}}", truncatedContent);
  }

  /**
   * Truncate content to a reasonable length for the LLM
   */
  private truncateContent(content: string): string {
    // For Gemini models, we can handle more content
    const maxChars = API.GOOGLE_AI.MAX_CONTENT_CHARS; // Generous limit for Gemini 2.0

    if (content.length <= maxChars) {
      return content;
    }

    // Truncate and add indicator
    return (
      content.substring(0, maxChars) + "... [content truncated due to length]"
    );
  }

  /**
   * Parse the summary response from the LLM
   */
  private parseSummaryResponse(text: string): {
    summary: string;
    shortSummary?: string;
    keyPoints?: string[];
    topics?: string[];
  } {
    // Default structure if parsing fails
    const defaultResult = {
      summary: text.trim(),
    };

    try {
      // Try to extract structured data

      // Extract summary
      const summaryMatch = text.match(
        /SUMMARY:(.+?)(?=SHORT SUMMARY:|KEY POINTS:|TOPICS:|$)/s,
      );
      const summary = summaryMatch ? summaryMatch[1].trim() : text.trim();

      // Extract short summary
      const shortSummaryMatch = text.match(
        /SHORT SUMMARY:(.+?)(?=KEY POINTS:|TOPICS:|$)/s,
      );
      const shortSummary = shortSummaryMatch
        ? shortSummaryMatch[1].trim()
        : undefined;

      // Extract key points
      const keyPointsMatch = text.match(/KEY POINTS:(.+?)(?=TOPICS:|$)/s);
      let keyPoints: string[] | undefined = undefined;

      if (keyPointsMatch) {
        const keyPointsText = keyPointsMatch[1].trim();
        keyPoints = keyPointsText
          .split(/\n-|\n\*/)
          .map((point) => point.trim())
          .filter((point) => point.length > 0);
      }

      // Extract topics
      const topicsMatch = text.match(/TOPICS:(.+?)$/s);
      let topics: string[] | undefined = undefined;

      if (topicsMatch) {
        const topicsText = topicsMatch[1].trim();
        topics = topicsText
          .split(/,|\n-|\n\*/)
          .map((topic) => topic.trim())
          .filter((topic) => topic.length > 0);
      }

      return {
        summary,
        shortSummary,
        keyPoints,
        topics,
      };
    } catch (error) {
      logger.warn("Failed to parse structured summary response", { error });
      return defaultResult;
    }
  }

  /**
   * Estimate reading time for content
   */
  private estimateReadingTime(content: string): number {
    // Average reading speed: 200-250 words per minute
    const wordsPerMinute = PROCESSING.READING_TIME.WORDS_PER_MINUTE;
    const wordCount = content.split(/\s+/).length;
    const readingTime = wordCount / wordsPerMinute;

    // Round to nearest half minute, with minimum of 1 minute
    return Math.max(1, Math.round(readingTime * 2) / 2);
  }

  /**
   * Rough estimate of token count
   * Note: This is a very rough approximation and actual token count
   * will vary based on the tokenizer used by the model
   */
  private estimateTokenCount(text: string): number {
    // Simple approximation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / PROCESSING.TOKEN_ESTIMATION.CHARS_PER_TOKEN);
  }
}
