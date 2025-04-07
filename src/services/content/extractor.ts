/**
 * Web Content Extractor
 *
 * This module provides functions for extracting content from web pages
 * using Cloudflare Workers' built-in browser utilities.
 */

import { logger } from "../../utils/logger";
import { ExtractedContent } from "../../types/story";
import { API } from "../../config/constants";
import { CloudflareClient } from "./cloudflare-client";
import { ENV } from "../../config/environment";
import { cleaner } from "./cleaner";

/**
 * Content extractor service using Cloudflare Workers' browser utilities
 */
export class ContentExtractor {
  private cloudflareClient: CloudflareClient;

  /**
   * Create a new content extractor
   *
   * @param timeout Request timeout in milliseconds (optional)
   * @param userAgent User agent string to use for requests (optional)
   */
  constructor(
    timeout = API.CONTENT.REQUEST_TIMEOUT,
    userAgent = API.CONTENT.USER_AGENT,
  ) {
    // Initialize the Cloudflare client
    this.cloudflareClient = new CloudflareClient(timeout, userAgent);

    logger.debug("Initialized Content Extractor with Cloudflare Browser API");
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

      // Use Cloudflare Browser API to extract content
      const content = await this.cloudflareClient.extractContent(url);

      if (!content) {
        logger.warn("Failed to extract content with Cloudflare Browser API", {
          url,
        });
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
}
