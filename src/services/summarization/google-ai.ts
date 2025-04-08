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
import { HNStoryID, HNStory } from "../../types/hackernews";
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
   * @param wordCount Optional pre-calculated word count
   * @param maxTokens Maximum tokens for the summary
   * @returns The generated summary
   */
  async summarize(
    storyId: HNStoryID,
    title: string,
    content: string,
    wordCount?: number,
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
          maxOutputTokens: this.maxOutputTokens,
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
        // Use provided wordCount if available, otherwise estimate from content
        estimatedReadingTime: this.estimateReadingTime(content, wordCount),
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
        summaryLength: summary.summary.length,
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
    // For Gemini 2.5 models, we can handle much more content
    const maxChars = API.GOOGLE_AI.MAX_CONTENT_CHARS; // Very generous limit for Gemini 2.5

    if (content.length <= maxChars) {
      return content;
    }

    // Even with the large context window, we still need to truncate extremely large content
    logger.info(
      `Truncating content from ${content.length} to ${maxChars} characters`,
    );
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

        // Make sure we have valid key points
        if (keyPoints.length === 0) {
          keyPoints = undefined;
        }
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

        // Make sure we have valid topics
        if (topics.length === 0) {
          topics = undefined;
        }
      }

      return {
        summary: summary || text.trim(), // Ensure we always have at least the original text
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
   * Updated to accept pre-calculated wordCount
   */
  /**
   * Generate a daily digest newspaper from a collection of stories and summaries
   *
   * @param stories Array of HackerNews stories
   * @param summaries Array of summaries for the stories
   * @param date Date string for the digest
   * @returns Generated digest content
   */
  async generateDigest(
    stories: HNStory[],
    summaries: Summary[],
    date: string,
  ): Promise<{
    content: string;
    model: string;
    tokens: { input: number; output: number };
  }> {
    // Prepare the input data for the LLM
    const storiesData = stories.map((story, index) => {
      const summary = summaries.find((s) => s.storyId === story.id);
      return {
        id: story.id,
        title: story.title,
        url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
        hnUrl: `https://news.ycombinator.com/item?id=${story.id}`,
        score: story.score,
        by: story.by,
        summary: summary?.summary || "",
        shortSummary: summary?.shortSummary || "",
        keyPoints: summary?.keyPoints || [],
        topics: summary?.topics || [],
      };
    });

    // Convert stories to string format for the prompt
    const storiesText = JSON.stringify(storiesData, null, 2);

    // Prepare the prompt
    const prompt = promptTemplates.dailyDigest
      .replace("{{DATE}}", date)
      .replace("{{STORIES}}", storiesText);

    // Track the start time for performance monitoring
    const startTime = Date.now();

    // Get the generative model
    const model = this.genAI.getGenerativeModel({
      model: this.model, // Fix: use this.model instead of this.modelName
      generationConfig: {
        temperature: API.GOOGLE_AI.DEFAULT_TEMPERATURE, // Lower temperature for more focused output
        maxOutputTokens: this.maxOutputTokens,
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

    // Generate the digest
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Track the end time
    const endTime = Date.now();
    logger.info(`Digest generation completed in ${endTime - startTime}ms`);

    // Make a rough estimate of tokens used
    const inputTokens = Math.ceil(
      prompt.length / PROCESSING.TOKEN_ESTIMATION.CHARS_PER_TOKEN,
    );
    const outputTokens = Math.ceil(
      text.length / PROCESSING.TOKEN_ESTIMATION.CHARS_PER_TOKEN,
    );

    // Return the generated digest
    return {
      content: text,
      model: this.model, // Fix: use this.model instead of this.modelName
      tokens: {
        input: inputTokens,
        output: outputTokens,
      },
    };
  }

  private estimateReadingTime(
    content: string,
    preCalculatedWordCount?: number,
  ): number {
    // Average reading speed: 200-250 words per minute
    const wordsPerMinute = PROCESSING.READING_TIME.WORDS_PER_MINUTE;

    // Use provided word count if available, otherwise calculate
    const wordCount =
      preCalculatedWordCount !== undefined
        ? preCalculatedWordCount
        : content.split(/\s+/).filter((word) => word.length > 0).length;

    const readingTime = wordCount / wordsPerMinute;

    // Round to nearest half minute, with minimum of 1 minute
    return Math.max(1, Math.round(readingTime * 2) / 2);
  }

  /**
   * Estimate token count
   * Updated to be more accurate for Gemini 2.5 models
   * Note: This is still an approximation, as the actual tokenization
   * performed by the model may vary.
   */
  private estimateTokenCount(text: string): number {
    // More accurate approximation for Gemini tokenization:
    // - 1 token ≈ 4 characters for English text in general
    // - 1 token ≈ 1-2 characters for code or specialized content

    // Check if content likely contains code (uses a simple heuristic)
    const containsCode = /```|\bfunction\b|\bclass\b|[{};]\n|\/\*|\*\//.test(
      text,
    );

    // Use a more conservative estimate for code-heavy content
    const charsPerToken = containsCode
      ? PROCESSING.TOKEN_ESTIMATION.CHARS_PER_CODE_TOKEN
      : PROCESSING.TOKEN_ESTIMATION.CHARS_PER_TOKEN;

    return Math.ceil(text.length / charsPerToken);
  }
}
