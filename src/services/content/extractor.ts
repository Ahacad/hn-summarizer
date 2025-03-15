/**
 * Web Content Extractor
 *
 * This module provides functions for extracting content from web pages.
 * It handles fetching the page, extracting the main content using Readability,
 * and cleaning up the content for summarization.
 */

import { Readability } from "readability";
import { JSDOM } from "jsdom";
import { logger } from "../../utils/logger";
import { cleaner } from "./cleaner";
import { ExtractedContent } from "../../types/story";
import { API } from "../../config/constants";

/**
 * Content extractor service
 */
export class ContentExtractor {
  private readonly userAgent: string;
  private readonly timeout: number;

  /**
   * Create a new content extractor
   *
   * @param userAgent User agent to use for requests
   * @param timeout Request timeout in milliseconds
   */
  constructor(
    userAgent = API.CONTENT.USER_AGENT,
    timeout = API.CONTENT.REQUEST_TIMEOUT,
  ) {
    this.userAgent = userAgent;
    this.timeout = timeout;
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

      // Fetch the page
      const html = await this.fetchPage(url);
      if (!html) {
        return null;
      }

      // Parse the HTML
      const dom = new JSDOM(html, { url });

      // Extract the content using Readability
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (!article) {
        logger.warn("Failed to extract content with Readability", { url });
        return null;
      }

      // Clean the content
      const cleanContent = cleaner.clean(article.textContent);

      return {
        url,
        title: article.title,
        byline: article.byline,
        content: cleanContent,
        excerpt: article.excerpt,
        siteName: article.siteName,
        rawContent: article.textContent,
        rawHtml: html,
        wordCount: cleanContent.split(/\s+/).length,
        extractedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error("Error extracting content", { error, url });
      return null;
    }
  }

  /**
   * Fetch a web page
   *
   * @param url URL to fetch
   * @returns HTML content or null if fetch failed
   */
  private async fetchPage(url: string): Promise<string | null> {
    try {
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      // Fetch the page with appropriate headers
      const response = await fetch(url, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
        signal: controller.signal,
      });

      // Clear the timeout
      clearTimeout(timeoutId);

      if (!response.ok) {
        logger.warn("Failed to fetch page", {
          url,
          status: response.status,
          statusText: response.statusText,
        });
        return null;
      }

      // Check content type
      const contentType = response.headers.get("content-type") || "";
      if (
        !contentType.includes("text/html") &&
        !contentType.includes("application/xhtml+xml")
      ) {
        logger.warn("Unsupported content type", { url, contentType });
        return null;
      }

      return await response.text();
    } catch (error) {
      if (error.name === "AbortError") {
        logger.warn("Request timed out", { url, timeout: this.timeout });
      } else {
        logger.error("Error fetching page", { error, url });
      }
      return null;
    }
  }
}
