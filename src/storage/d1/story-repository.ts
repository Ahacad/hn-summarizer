/**
 * Story Repository
 *
 * This module provides a repository for managing story metadata in D1.
 * It handles CRUD operations for stories and manages the relationship
 * between stories and their content/summaries.
 */

import { ENV } from "../../config/environment";
import { logger } from "../../utils/logger";
import { HNStory, HNStoryID } from "../../types/hackernews";
import { ProcessedStory, ProcessingStatus } from "../../types/story";

/**
 * Repository for managing story metadata
 */
export class StoryRepository {
  private db: D1Database;

  /**
   * Create a new story repository
   */
  constructor() {
    this.db = ENV.get("HN_SUMMARIZER_DB");
  }

  /**
   * Save a story to the database
   *
   * @param story Story to save
   * @returns Whether the operation was successful
   */
  async saveStory(story: ProcessedStory): Promise<boolean> {
    try {
      const now = new Date().toISOString();

      // Check if story already exists
      const existing = await this.getStory(story.id);

      if (existing) {
        // Update existing story
        const result = await this.db
          .prepare(
            `
          UPDATE stories 
          SET 
            title = ?, 
            url = ?, 
            by = ?, 
            time = ?, 
            score = ?, 
            status = ?, 
            content_id = ?, 
            summary_id = ?, 
            updated_at = ?,
            error = ?
          WHERE id = ?
        `,
          )
          .bind(
            story.title,
            story.url,
            story.by,
            story.time,
            story.score,
            story.status,
            story.contentId || null,
            story.summaryId || null,
            now,
            story.error || null,
            story.id,
          )
          .run();

        logger.debug("Updated story in database", {
          storyId: story.id,
          status: story.status,
        });

        return result.success;
      } else {
        // Insert new story
        const result = await this.db
          .prepare(
            `
          INSERT INTO stories (
            id, title, url, by, time, score, status, 
            content_id, summary_id, processed_at, updated_at, error
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          )
          .bind(
            story.id,
            story.title,
            story.url,
            story.by,
            story.time,
            story.score,
            story.status,
            story.contentId || null,
            story.summaryId || null,
            now,
            now,
            story.error || null,
          )
          .run();

        logger.debug("Inserted new story in database", {
          storyId: story.id,
          status: story.status,
        });

        return result.success;
      }
    } catch (error) {
      logger.error("Error saving story to database", {
        error,
        storyId: story.id,
      });
      return false;
    }
  }

  /**
   * Get a story from the database
   *
   * @param id Story ID
   * @returns Story data or null if not found
   */
  async getStory(id: HNStoryID): Promise<ProcessedStory | null> {
    try {
      const result = await this.db
        .prepare(
          `
        SELECT * FROM stories WHERE id = ?
      `,
        )
        .bind(id)
        .first<StoriesRow>();

      if (!result) {
        return null;
      }

      return this.mapRowToStory(result);
    } catch (error) {
      logger.error("Error getting story from database", { error, storyId: id });
      return null;
    }
  }

  /**
   * Get stories by status
   *
   * @param status Processing status to filter by
   * @param limit Maximum number of stories to return
   * @returns Array of stories
   */
  async getStoriesByStatus(
    status: ProcessingStatus,
    limit = 10,
  ): Promise<ProcessedStory[]> {
    try {
      const results = await this.db
        .prepare(
          `
        SELECT * FROM stories 
        WHERE status = ? 
        ORDER BY score DESC, time DESC
        LIMIT ?
      `,
        )
        .bind(status, limit)
        .all<StoriesRow>();

      return results.results.map((row) => this.mapRowToStory(row));
    } catch (error) {
      logger.error("Error getting stories by status", { error, status });
      return [];
    }
  }

  /**
   * Get stories by multiple statuses
   *
   * @param statuses Array of processing statuses to filter by
   * @param limit Maximum number of stories to return
   * @returns Array of stories
   */
  async getStoriesByMultipleStatuses(
    statuses: ProcessingStatus[],
    limit = 10,
  ): Promise<ProcessedStory[]> {
    try {
      if (!statuses || statuses.length === 0) {
        return [];
      }

      // Create placeholders for the SQL query
      const placeholders = statuses.map(() => "?").join(",");

      const query = `
        SELECT * FROM stories 
        WHERE status IN (${placeholders}) 
        ORDER BY score DESC, time DESC
        LIMIT ?
      `;

      // Create binding parameters
      const params = [...statuses, limit];

      const results = await this.db
        .prepare(query)
        .bind(...params)
        .all<StoriesRow>();

      return results.results.map((row) => this.mapRowToStory(row));
    } catch (error) {
      logger.error("Error getting stories by multiple statuses", {
        error,
        statuses,
      });
      return [];
    }
  }

  /**
   * Get the latest completed and sent stories
   *
   * @param limit Maximum number of stories to return
   * @returns Array of stories
   */
  async getLatestProcessedStories(limit = 10): Promise<ProcessedStory[]> {
    return this.getStoriesByMultipleStatuses(
      [ProcessingStatus.COMPLETED, ProcessingStatus.SENT],
      limit,
    );
  }

  /**
   * Update story status
   *
   * @param id Story ID
   * @param status New status
   * @param error Optional error message
   * @returns Whether the operation was successful
   */
  async updateStatus(
    id: HNStoryID,
    status: ProcessingStatus,
    error?: string,
  ): Promise<boolean> {
    try {
      const now = new Date().toISOString();

      const result = await this.db
        .prepare(
          `
        UPDATE stories 
        SET status = ?, updated_at = ?, error = ?
        WHERE id = ?
      `,
        )
        .bind(status, now, error || null, id)
        .run();

      logger.debug("Updated story status", {
        storyId: id,
        status,
        success: result.success,
      });

      return result.success;
    } catch (error) {
      logger.error("Error updating story status", { error, storyId: id });
      return false;
    }
  }

  /**
   * Update story content ID
   *
   * @param id Story ID
   * @param contentId Content ID in R2
   * @returns Whether the operation was successful
   */
  async updateContentId(id: HNStoryID, contentId: string): Promise<boolean> {
    try {
      const now = new Date().toISOString();

      const result = await this.db
        .prepare(
          `
        UPDATE stories 
        SET content_id = ?, updated_at = ?
        WHERE id = ?
      `,
        )
        .bind(contentId, now, id)
        .run();

      logger.debug("Updated story content ID", {
        storyId: id,
        contentId,
        success: result.success,
      });

      return result.success;
    } catch (error) {
      logger.error("Error updating story content ID", { error, storyId: id });
      return false;
    }
  }

  /**
   * Update story summary ID
   *
   * @param id Story ID
   * @param summaryId Summary ID in R2
   * @returns Whether the operation was successful
   */
  async updateSummaryId(id: HNStoryID, summaryId: string): Promise<boolean> {
    try {
      const now = new Date().toISOString();

      const result = await this.db
        .prepare(
          `
        UPDATE stories 
        SET summary_id = ?, updated_at = ?
        WHERE id = ?
      `,
        )
        .bind(summaryId, now, id)
        .run();

      logger.debug("Updated story summary ID", {
        storyId: id,
        summaryId,
        success: result.success,
      });

      return result.success;
    } catch (error) {
      logger.error("Error updating story summary ID", { error, storyId: id });
      return false;
    }
  }

  /**
   * Check if a story exists in the database
   *
   * @param id Story ID
   * @returns Whether the story exists
   */
  async exists(id: HNStoryID): Promise<boolean> {
    try {
      const result = await this.db
        .prepare(
          `
        SELECT 1 FROM stories WHERE id = ?
      `,
        )
        .bind(id)
        .first<{ 1: number }>();

      return result !== null;
    } catch (error) {
      logger.error("Error checking if story exists", { error, storyId: id });
      return false;
    }
  }

  /**
   * Get the latest processed stories
   *
   * @param limit Maximum number of stories to return
   * @returns Array of stories
   */
  async getLatestStories(limit = 10): Promise<ProcessedStory[]> {
    try {
      const results = await this.db
        .prepare(
          `
        SELECT * FROM stories 
        WHERE status IN (?, ?)
        ORDER BY processed_at DESC
        LIMIT ?
      `,
        )
        .bind(ProcessingStatus.COMPLETED, ProcessingStatus.SENT, limit)
        .all<StoriesRow>();

      return results.results.map((row) => this.mapRowToStory(row));
    } catch (error) {
      logger.error("Error getting latest stories", { error });
      return [];
    }
  }

  /**
   * Convert a database row to a ProcessedStory object
   */
  private mapRowToStory(row: StoriesRow): ProcessedStory {
    return {
      id: row.id,
      title: row.title,
      url: row.url || null,
      by: row.by,
      time: row.time,
      score: row.score,
      status: row.status as ProcessingStatus,
      contentId: row.content_id || undefined,
      summaryId: row.summary_id || undefined,
      processedAt: row.processed_at,
      updatedAt: row.updated_at,
      error: row.error || undefined,
    };
  }
}

/**
 * Database row type for stories table
 */
interface StoriesRow {
  id: number;
  title: string;
  url: string | null;
  by: string;
  time: number;
  score: number;
  status: string;
  content_id: string | null;
  summary_id: string | null;
  processed_at: string;
  updated_at: string;
  error: string | null;
}
