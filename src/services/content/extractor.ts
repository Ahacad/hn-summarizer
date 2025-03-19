/**
 * Web Content Extractor
 *
 * This module provides functions for extracting content from web pages
 * using a self-hosted Firecrawl API service.
 */

import { logger } from "../../utils/logger";
import { ExtractedContent } from "../../types/story";
import { API } from "../../config/constants";
import { FirecrawlClient } from "./firecrawl-client";
import { ENV } from "../../config/environment";
import { cleaner } from "./cleaner";

/**
 * Content extractor service using self-hosted Firecrawl API
 */
export class ContentExtractor {
  private firecrawlClient: FirecrawlClient;

  /**
   * Create a new content extractor
   *
   * @param apiUrl Firecrawl API URL (optional, will use env var if not provided)
   * @param apiKey Firecrawl API key (optional for self-hosted API)
   */
  constructor(apiUrl?: string, apiKey?: string) {
    const configuredUrl = apiUrl || ENV.get("FIRECRAWL_API_URL");

    if (!configuredUrl) {
      throw new Error(
        "Firecrawl API URL is required. Set FIRECRAWL_API_URL environment variable or pass it to the constructor.",
      );
    }

    // Initialize the Firecrawl client
    this.firecrawlClient = new FirecrawlClient(configuredUrl, apiKey);

    logger.debug("Initialized Content Extractor with Firecrawl API", {
      apiUrl: configuredUrl,
    });
  }

  /**
   * Extract content from a URL
   *
   * @param url URL to extract content from
   * @returns Extracted content or null if extraction failed
   */
  async extract(url: string): Promise<ExtractedContent | null> {
    try {
      logger.debug("Extracting content", { url });

      // Use Firecrawl API to extract content
      const content = await this.firecrawlClient.extractContent(url);

      if (!content) {
        logger.warn("Failed to extract content with Firecrawl API", { url });
        return null;
      }

      // Apply additional cleaning to the extracted content
      if (content.content) {
        content.content = cleaner.clean(content.content);
      }

      // Generate an excerpt if none was provided
      if (!content.excerpt && content.content) {
        content.excerpt = cleaner.extractExcerpt(content.content, 200);
      }

      logger.debug("Successfully extracted content", {
        url,
        title: content.title,
        wordCount: content.wordCount,
      });

      return content;
    } catch (error) {
      logger.error("Error extracting content", { error, url });
      return null;
    }
  }

  /**
   * Extract structured data from a URL
   *
   * @param url URL to extract data from
   * @returns Structured data or null if extraction failed
   */
  async extractStructuredData(url: string): Promise<any | null> {
    try {
      logger.debug("Extracting structured data from URL", { url });

      // Define a schema for article extraction
      const schema = {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The title of the article",
          },
          author: {
            type: "string",
            description: "The author of the article",
          },
          publishDate: {
            type: "string",
            description: "The publication date of the article",
          },
          content: {
            type: "string",
            description: "The main content of the article",
          },
          summary: {
            type: "string",
            description: "A brief summary of the article",
          },
          topics: {
            type: "array",
            items: {
              type: "string",
            },
            description: "Main topics covered in the article",
          },
        },
        required: ["title", "content"],
      };

      // Extract structured data using Firecrawl
      const data = await this.firecrawlClient.extractStructuredData(
        url,
        schema,
        "Extract the article's title, author, publication date, main content, a brief summary, and the main topics covered.",
      );

      if (!data) {
        logger.warn("Failed to extract structured data with Firecrawl API", {
          url,
        });
        return null;
      }

      logger.debug("Successfully extracted structured data", {
        url,
        hasTitle: !!data.title,
        hasContent: !!data.content,
      });

      return data;
    } catch (error) {
      logger.error("Error extracting structured data", { error, url });
      return null;
    }
  }
}
