/**
 * Content Repository
 *
 * This module provides a repository for managing content in R2 storage.
 * It handles storing and retrieving both extracted content and summaries.
 */

import { ENV } from "../../config/environment";
import { logger } from "../../utils/logger";
import { ExtractedContent } from "../../types/story";
import { Summary } from "../../types/summary";
import { HNStoryID } from "../../types/hackernews";
import { STORAGE } from "../../config/constants";

/**
 * Repository for managing content in R2
 */
export class ContentRepository {
  private bucket: R2Bucket;

  /**
   * Create a new content repository
   */
  constructor() {
    this.bucket = ENV.get("CONTENT_BUCKET");
  }

  /**
   * Save extracted content to R2
   *
   * @param storyId HackerNews story ID
   * @param content Extracted content
   * @returns Content ID or null if failed
   */
  async saveContent(
    storyId: HNStoryID,
    content: ExtractedContent,
  ): Promise<string | null> {
    try {
      // Generate a content ID
      const contentId = `${STORAGE.R2.CONTENT_PREFIX}${storyId}/${Date.now()}`;

      // Convert content to JSON
      const contentJson = JSON.stringify(content);

      // Upload content to R2
      await this.bucket.put(contentId, contentJson, {
        customMetadata: {
          storyId: storyId.toString(),
          contentType: "extracted-content",
          extractedAt: content.extractedAt,
          url: content.url,
        },
      });

      logger.debug("Saved content to R2", { storyId, contentId });

      return contentId;
    } catch (error) {
      logger.error("Error saving content to R2", { error, storyId });
      return null;
    }
  }

  /**
   * Get extracted content from R2
   *
   * @param contentId Content ID
   * @returns Extracted content or null if not found
   */
  async getContent(contentId: string): Promise<ExtractedContent | null> {
    try {
      // Get content from R2
      const object = await this.bucket.get(contentId);

      if (!object) {
        logger.warn("Content not found in R2", { contentId });
        return null;
      }

      // Parse content JSON
      const contentJson = await object.text();
      const content = JSON.parse(contentJson) as ExtractedContent;

      logger.debug("Retrieved content from R2", { contentId });

      return content;
    } catch (error) {
      logger.error("Error getting content from R2", { error, contentId });
      return null;
    }
  }

  /**
   * Save summary to R2
   *
   * @param storyId HackerNews story ID
   * @param summary Generated summary
   * @returns Summary ID or null if failed
   */
  async saveSummary(
    storyId: HNStoryID,
    summary: Summary,
  ): Promise<string | null> {
    try {
      // Generate a summary ID
      const summaryId = `${STORAGE.R2.SUMMARY_PREFIX}${storyId}/${Date.now()}`;

      // Convert summary to JSON
      const summaryJson = JSON.stringify(summary);

      // Upload summary to R2
      await this.bucket.put(summaryId, summaryJson, {
        customMetadata: {
          storyId: storyId.toString(),
          contentType: "summary",
          generatedAt: summary.generatedAt,
          model: summary.model,
        },
      });

      logger.debug("Saved summary to R2", { storyId, summaryId });

      return summaryId;
    } catch (error) {
      logger.error("Error saving summary to R2", { error, storyId });
      return null;
    }
  }

  /**
   * Get summary from R2
   *
   * @param summaryId Summary ID
   * @returns Summary or null if not found
   */
  async getSummary(summaryId: string): Promise<Summary | null> {
    try {
      // Get summary from R2
      const object = await this.bucket.get(summaryId);

      if (!object) {
        logger.warn("Summary not found in R2", { summaryId });
        return null;
      }

      // Parse summary JSON
      const summaryJson = await object.text();
      const summary = JSON.parse(summaryJson) as Summary;

      logger.debug("Retrieved summary from R2", { summaryId });

      return summary;
    } catch (error) {
      logger.error("Error getting summary from R2", { error, summaryId });
      return null;
    }
  }

  /**
   * Get the latest content for a story
   *
   * @param storyId HackerNews story ID
   * @returns Latest content or null if not found
   */
  async getLatestContent(storyId: HNStoryID): Promise<ExtractedContent | null> {
    try {
      // List objects with the content prefix for this story
      const objects = await this.bucket.list({
        prefix: `${STORAGE.R2.CONTENT_PREFIX}${storyId}/`,
        limit: 1,
        delimiter: "/",
      });

      if (!objects.objects || objects.objects.length === 0) {
        logger.debug("No content found for story", { storyId });
        return null;
      }

      // Get the latest content (should be sorted by date in the key)
      const latestContent = objects.objects[0];

      return await this.getContent(latestContent.key);
    } catch (error) {
      logger.error("Error getting latest content", { error, storyId });
      return null;
    }
  }

  /**
   * Get the latest summary for a story
   *
   * @param storyId HackerNews story ID
   * @returns Latest summary or null if not found
   */
  async getLatestSummary(storyId: HNStoryID): Promise<Summary | null> {
    try {
      // List objects with the summary prefix for this story
      const objects = await this.bucket.list({
        prefix: `${STORAGE.R2.SUMMARY_PREFIX}${storyId}/`,
        limit: 1,
        delimiter: "/",
      });

      if (!objects.objects || objects.objects.length === 0) {
        logger.debug("No summary found for story", { storyId });
        return null;
      }

      // Get the latest summary (should be sorted by date in the key)
      const latestSummary = objects.objects[0];

      return await this.getSummary(latestSummary.key);
    } catch (error) {
      logger.error("Error getting latest summary", { error, storyId });
      return null;
    }
  }
}
