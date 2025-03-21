/**
 * Firecrawl API Client
 *
 * This module provides a client for interacting with a self-hosted Firecrawl API
 * to extract content from web pages.
 */

import { logger } from "../../utils/logger";
import { ExtractedContent } from "../../types/story";
import { API } from "../../config/constants";
import { ENV } from "../../config/environment";

/**
 * Firecrawl API client for extracting content from web pages
 */
export class FirecrawlClient {
  private apiUrl: string;
  private timeout: number;
  private apiKey: string | null;

  /**
   * Create a new Firecrawl API client
   *
   * @param apiUrl Firecrawl API URL (required)
   * @param timeout Request timeout in milliseconds
   * @param apiKey API key (optional for self-hosted instances)
   */
  constructor(
    apiUrl?: string,
    timeout = API.CONTENT.REQUEST_TIMEOUT,
    apiKey?: string,
  ) {
    // Get API URL from environment if not provided (required)
    this.apiUrl = apiUrl || ENV.get("FIRECRAWL_API_URL");

    if (!this.apiUrl) {
      throw new Error("Firecrawl API URL is required");
    }

    this.timeout = timeout;
    this.apiKey = apiKey || null; // Store API key if provided

    logger.debug("Initialized Firecrawl API client", {
      apiUrl: this.apiUrl,
      // Don't log the actual API key
      hasApiKey: !!this.apiKey,
    });
  }

  /**
   * Extract content from a URL using Firecrawl's scrape endpoint
   *
   * @param url URL to extract content from
   * @returns Extracted content or null if extraction failed
   */
  async extractContent(url: string): Promise<ExtractedContent | null> {
    try {
      logger.debug("Extracting content via Firecrawl API", { url });

      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      // Prepare request headers
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Add API key if available
      if (this.apiKey) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      }

      // Prepare API request
      // Note: No need to add /v1 as the proxy will handle that
      const response = await fetch(`${this.apiUrl}/scrape`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          url,
          formats: ["markdown", "html"],
        }),
        signal: controller.signal,
      });

      // Clear the timeout
      clearTimeout(timeoutId);

      if (!response.ok) {
        logger.warn("Firecrawl API request failed", {
          url,
          status: response.status,
          statusText: response.statusText,
        });
        return null;
      }

      // Parse the API response
      const data = await response.json();

      if (!data.success) {
        logger.warn("Firecrawl extraction failed", {
          url,
          error: data.error,
        });
        return null;
      }

      // Extract metadata from the response
      const metadata = data.data.metadata || {};

      // Calculate word count from markdown
      const markdown = data.data.markdown || "";
      const cleanedText = markdown
        .replace(/```[\s\S]*?```/g, "") // Remove code blocks
        .replace(/`.*?`/g, "") // Remove inline code
        .replace(/\!?\[.*?\]\(.*?\)/g, "") // Remove markdown links
        .replace(/\n#+\s+/g, "\n") // Remove heading markers
        .replace(/\n[-*+]\s+/g, "\n"); // Remove list markers

      // Count words more accurately
      const wordCount = cleanedText
        .split(/\s+/)
        .filter((word) => word.trim().length > 0).length;

      // Map Firecrawl response to our ExtractedContent type
      const extractedContent: ExtractedContent = {
        url: url,
        title: metadata.title || "",
        byline: metadata.author || null,
        content: markdown,
        excerpt: metadata.description || null,
        siteName: metadata.ogSiteName || null,
        rawContent: markdown,
        rawHtml: data.data.html || "",
        wordCount: wordCount,
        extractedAt: new Date().toISOString(),
      };

      logger.debug("Successfully extracted content via Firecrawl API", {
        url,
        title: extractedContent.title,
        wordCount: extractedContent.wordCount,
      });

      return extractedContent;
    } catch (error) {
      if (error.name === "AbortError") {
        logger.warn("Firecrawl API request timed out", {
          url,
          timeout: this.timeout,
        });
      } else {
        logger.error("Error extracting content via Firecrawl API", {
          error,
          url,
        });
      }
      return null;
    }
  }

  /**
   * Extract structured data from a URL using Firecrawl's extract endpoint
   *
   * @param url URL to extract data from
   * @param schema JSON schema for the data to extract
   * @param prompt Optional prompt to guide extraction
   * @returns Extracted data or null if extraction failed
   */
  async extractStructuredData(
    url: string,
    schema: any,
    prompt?: string,
  ): Promise<any | null> {
    try {
      logger.debug("Extracting structured data via Firecrawl API", { url });

      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      // Prepare request headers
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Add API key if available
      if (this.apiKey) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      }

      // Prepare the request body
      const requestBody: any = {
        urls: [url],
        schema: schema,
      };

      if (prompt) {
        requestBody.prompt = prompt;
      }

      // Make the API request
      // Note: No need to add /v1 as the proxy will handle that
      const response = await fetch(`${this.apiUrl}/extract`, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      // Clear the timeout
      clearTimeout(timeoutId);

      if (!response.ok) {
        logger.warn("Firecrawl API request failed", {
          url,
          status: response.status,
          statusText: response.statusText,
        });
        return null;
      }

      // Parse the API response
      const data = await response.json();

      if (!data.success) {
        logger.warn("Firecrawl extraction failed", {
          url,
          error: data.error,
        });
        return null;
      }

      // If we get a job ID, we need to poll for results
      if (data.id) {
        // Poll for results (with backoff)
        const extractionData = await this.pollForExtractionResults(data.id);
        return extractionData;
      }

      // Direct response without job ID
      return data.data;
    } catch (error) {
      if (error.name === "AbortError") {
        logger.warn("Firecrawl API request timed out", {
          url,
          timeout: this.timeout,
        });
      } else {
        logger.error("Error extracting structured data via Firecrawl API", {
          error,
          url,
        });
      }
      return null;
    }
  }

  /**
   * Poll for extraction results from a job ID
   *
   * @param jobId Job ID to poll for
   * @param maxAttempts Maximum number of polling attempts
   * @param initialDelay Initial delay in milliseconds
   * @returns Extraction results or null if polling failed
   */
  private async pollForExtractionResults(
    jobId: string,
    maxAttempts = 10,
    initialDelay = 2000,
  ): Promise<any | null> {
    let attempts = 0;
    let delay = initialDelay;

    while (attempts < maxAttempts) {
      try {
        // Wait for the specified delay
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Check job status
        // Note: No need to add /v1 as the proxy will handle that
        const response = await fetch(`${this.apiUrl}/extract/${jobId}`, {
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          logger.warn("Failed to poll extraction job", {
            jobId,
            status: response.status,
            statusText: response.statusText,
          });
          attempts++;
          delay *= 1.5; // Exponential backoff
          continue;
        }

        const data = await response.json();

        // Check if job is completed
        if (data.status === "completed") {
          return data.data;
        }

        // If job is still processing, continue polling
        if (data.status === "processing" || data.status === "queued") {
          attempts++;
          delay *= 1.5; // Exponential backoff
          continue;
        }

        // If job failed, return null
        if (data.status === "failed") {
          logger.warn("Extraction job failed", { jobId, error: data.error });
          return null;
        }
      } catch (error) {
        logger.error("Error polling extraction job", { error, jobId });
        attempts++;
        delay *= 1.5; // Exponential backoff
      }
    }

    logger.warn("Exceeded maximum polling attempts for extraction job", {
      jobId,
    });
    return null;
  }
}
