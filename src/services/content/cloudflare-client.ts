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

/**
 * Cloudflare Browser client for extracting content from web pages
 */
export class CloudflareClient {
  private timeout: number;
  private userAgent: string;
  private static currentRequests = 0;
  private static maxConcurrentRequests = 3; // Limit concurrent requests
  private static requestQueue = [];
  private static processingQueue = false;

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
   * Process the request queue to manage concurrent requests
   * @private
   */
  private static async processQueue() {
    if (CloudflareClient.processingQueue) return;

    CloudflareClient.processingQueue = true;

    while (
      CloudflareClient.requestQueue.length > 0 &&
      CloudflareClient.currentRequests < CloudflareClient.maxConcurrentRequests
    ) {
      const { resolve, reject, fn } = CloudflareClient.requestQueue.shift();
      CloudflareClient.currentRequests++;

      try {
        const result = await fn();
        resolve(result);
      } catch (error) {
        reject(error);
      } finally {
        CloudflareClient.currentRequests--;
      }
    }

    CloudflareClient.processingQueue = false;

    // If there are more items in the queue, continue processing
    if (CloudflareClient.requestQueue.length > 0) {
      CloudflareClient.processQueue();
    }
  }

  /**
   * Add a request to the queue
   * @private
   * @param fn Function to execute when the request is processed
   * @returns Promise that resolves with the function's result
   */
  private static queueRequest(fn) {
    return new Promise((resolve, reject) => {
      CloudflareClient.requestQueue.push({ resolve, reject, fn });
      CloudflareClient.processQueue();
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
    return CloudflareClient.queueRequest(async () => {
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

          logger.debug("Extracting content via Cloudflare Browser API", {
            url,
          });

          // Create AbortController for timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), this.timeout);

          // Using Cloudflare Workers' fetch with enhanced browser capabilities
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

          // Simple extraction of title, meta description, and content
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          const title = titleMatch ? titleMatch[1].trim() : "";

          // Extract meta description
          const descriptionMatch =
            html.match(
              /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i,
            ) ||
            html.match(
              /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["'][^>]*>/i,
            );
          const description = descriptionMatch
            ? descriptionMatch[1].trim()
            : "";

          // Extract site name from og:site_name
          const siteNameMatch =
            html.match(
              /<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["'][^>]*>/i,
            ) ||
            html.match(
              /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:site_name["'][^>]*>/i,
            );
          const siteName = siteNameMatch ? siteNameMatch[1].trim() : "";

          // Extract author if available
          const authorMatch =
            html.match(
              /<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["'][^>]*>/i,
            ) ||
            html.match(
              /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']author["'][^>]*>/i,
            );
          const author = authorMatch ? authorMatch[1].trim() : "";

          // Basic HTML to text conversion for content
          // Remove scripts, styles, and other non-content elements
          let content = html
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
            .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
            .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
            .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ")
            .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, " ");

          // Try to extract main content
          const mainContentMatch =
            content.match(/<main\b[^<]*(?:(?!<\/main>)<[^<]*)*<\/main>/i) ||
            content.match(
              /<article\b[^<]*(?:(?!<\/article>)<[^<]*)*<\/article>/i,
            ) ||
            content.match(
              /<div[^>]*class=["'][^"']*content[^"']*["'][^>]*>[\s\S]*?<\/div>/i,
            );

          if (mainContentMatch) {
            content = mainContentMatch[0];
          }

          // Remove remaining HTML tags and decode entities
          content = content
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/\s+/g, " ")
            .trim();

          // Count words
          const wordCount = content
            .split(/\s+/)
            .filter((word) => word.trim().length > 0).length;

          // Create the extracted content object
          const extractedContent: ExtractedContent = {
            url,
            title,
            byline: author || null,
            content,
            excerpt: description || null,
            siteName: siteName || null,
            rawContent: content,
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
          } else if (error.message === "Too many subrequests.") {
            logger.warn("Cloudflare subrequest limit reached", {
              url,
              attempt: attempts + 1,
            });

            // Special handling for this error - wait longer before retry
            const longDelay = retryDelay * Math.pow(3, attempts);
            await new Promise((resolve) => setTimeout(resolve, longDelay));
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
    });
  }
}
