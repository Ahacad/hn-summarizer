/**
 * Cloudflare Browser Utilities API Client
 *
 * This module provides a client for interacting with Cloudflare Workers' built-in
 * browser utilities to extract content from web pages.
 */

import { logger } from "../../utils/logger";
import { ExtractedContent } from "../../types/story";
import { API } from "../../config/constants";
import { ENV } from "../../config/environment";
import { JSDOM } from "jsdom";
import { Readability } from "readability";

/**
 * Cloudflare Browser client for extracting content from web pages
 */
export class CloudflareClient {
  private timeout: number;
  private userAgent: string;

  /**
   * Create a new Cloudflare Browser client
   *
   * @param timeout Request timeout in milliseconds
   * @param userAgent User agent string to use for requests
   */
  constructor(
    timeout = API.CONTENT.REQUEST_TIMEOUT,
    userAgent = API.CONTENT.USER_AGENT,
  ) {
    this.timeout = timeout;
    this.userAgent = userAgent;

    logger.debug("Initialized Cloudflare Browser client", {
      timeout: this.timeout,
    });
  }

  /**
   * Extract content from a URL using Cloudflare Workers' browser utilities
   * Includes retry mechanism for resiliency
   *
   * @param url URL to extract content from
   * @param retryCount Number of retry attempts (default: 3)
   * @param retryDelay Delay between retries in ms (default: 1000)
   * @returns Extracted content or null if extraction failed
   */
  async extractContent(
    url: string,
    retryCount = 3,
    retryDelay = 1000,
  ): Promise<ExtractedContent | null> {
    let attempts = 0;

    while (attempts <= retryCount) {
      try {
        // Add delay between attempts
        if (attempts > 0) {
          logger.info(`Retry attempt ${attempts} for extracting content`, {
            url,
          });
          // Use exponential backoff
          const delay = retryDelay * Math.pow(2, attempts - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        logger.debug("Extracting content via Cloudflare Browser API", { url });

        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        // Using Cloudflare Workers' fetch with correct headers
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "User-Agent": this.userAgent,
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
          signal: controller.signal,
          cf: {
            // Cloudflare Workers specific options for browser rendering
            cacheTtl: 3600,
            cacheEverything: true,
            scrapeShield: false,
          },
        });

        // Clear the timeout
        clearTimeout(timeoutId);

        if (!response.ok) {
          logger.warn("Failed to fetch URL", {
            url,
            status: response.status,
            statusText: response.statusText,
            attempt: attempts + 1,
            maxAttempts: retryCount + 1,
          });

          attempts++;
          if (attempts <= retryCount) continue;
          return null;
        }

        // Check content type to ensure it's HTML
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("text/html")) {
          logger.warn("URL returned non-HTML content", {
            url,
            contentType,
          });
          return null;
        }

        // Get HTML content
        const html = await response.text();

        // Parse with JSDOM and Readability
        const dom = new JSDOM(html, { url });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();

        if (!article) {
          logger.warn("Failed to parse article content", { url });
          attempts++;
          if (attempts <= retryCount) continue;
          return null;
        }

        // Calculate word count
        const wordCount = article.textContent
          .split(/\s+/)
          .filter((word) => word.trim().length > 0).length;

        // Build the extracted content object
        const extractedContent: ExtractedContent = {
          url,
          title: article.title || "",
          byline: article.byline || null,
          content: article.textContent || "",
          excerpt: article.excerpt || null,
          siteName: article.siteName || null,
          rawContent: article.textContent || "",
          rawHtml: html,
          wordCount,
          extractedAt: new Date().toISOString(),
        };

        logger.debug(
          "Successfully extracted content via Cloudflare Browser API",
          {
            url,
            title: extractedContent.title,
            wordCount: extractedContent.wordCount,
          },
        );

        return extractedContent;
      } catch (error) {
        if (error.name === "AbortError") {
          logger.warn("Request timed out", {
            url,
            timeout: this.timeout,
          });
        } else {
          logger.error("Error extracting content", {
            error,
            url,
          });
        }
        attempts++;
      }
    }

    // If we've exhausted all retry attempts
    logger.warn("All retry attempts failed for content extraction", {
      url,
      attempts: retryCount + 1,
    });
    return null;
  }
}
