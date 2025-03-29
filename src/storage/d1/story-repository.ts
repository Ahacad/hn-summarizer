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
import { PROCESSING } from "../../config/constants";

/**
 * Repository for managing story metadata
 */
export class StoryRepository {
  // Database instance (exposed for direct queries by admin APIs)
  public db: D1Database;

  /**
   * Create a new story repository
   */
  constructor() {
    try {
      this.db = ENV.get("HN_SUMMARIZER_DB");

      // Add validation check
      if (!this.db) {
        logger.error(
          "Failed to initialize StoryRepository - database binding is null",
        );
      } else {
        logger.debug("StoryRepository initialized successfully");
      }
    } catch (error) {
      logger.error("Failed to initialize StoryRepository", { error });
      // Initialize with null - operations will fail but won't crash the app
      this.db = null;
    }
  }

  /**
   * Check if the database connection is valid
   */
  isConnected(): boolean {
    return !!this.db;
  }

  /**
   * Validate database connection before operations
   * @throws Error if not connected
   */
  private validateConnection() {
    if (!this.db) {
      const error = new Error("Database connection not available");
      logger.error("Database validation failed", { error });
      throw error;
    }
  }

  /**
   * Save a story to the database
   *
   * @param story Story to save
   * @returns Whether the operation was successful
   */
  async saveStory(story: ProcessedStory): Promise<boolean> {
    try {
      this.validateConnection();
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
            content_id, summary_id, processed_at, updated_at, error, retry_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            story.retryCount || 0,
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
      this.validateConnection();
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
      this.validateConnection();
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
      this.validateConnection();
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
      this.validateConnection();
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
      this.validateConnection();
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
      this.validateConnection();
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
      this.validateConnection();
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
      this.validateConnection();
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
   * Mark a story for extraction retry
   *
   * @param id Story ID
   * @param retryCount Current retry count
   * @param error Optional error message
   * @returns Whether the operation was successful
   */
  async markForExtractRetry(
    id: HNStoryID,
    retryCount: number = 0,
    error?: string,
  ): Promise<boolean> {
    try {
      this.validateConnection();
      const now = new Date().toISOString();

      const result = await this.db
        .prepare(
          `
        UPDATE stories 
        SET status = ?, retry_count = ?, updated_at = ?, error = ?
        WHERE id = ?
      `,
        )
        .bind(
          ProcessingStatus.RETRY_EXTRACT,
          retryCount + 1,
          now,
          error || null,
          id,
        )
        .run();

      logger.debug("Marked story for extraction retry", {
        storyId: id,
        retryCount: retryCount + 1,
        success: result.success,
      });

      return result.success;
    } catch (error) {
      logger.error("Error marking story for extraction retry", {
        error,
        storyId: id,
      });
      return false;
    }
  }

  /**
   * Get the last run time for a worker
   *
   * @param workerName Name of the worker
   * @returns ISO timestamp of the last run or null if not found
   */
  async getLastWorkerRunTime(workerName: string): Promise<string | null> {
    try {
      this.validateConnection();
      const result = await this.db
        .prepare(
          `
        SELECT last_run_time FROM worker_run_times WHERE worker_name = ?
      `,
        )
        .bind(workerName)
        .first<{ last_run_time: string }>();

      return result ? result.last_run_time : null;
    } catch (error) {
      logger.error("Error getting worker last run time", { error, workerName });
      return null;
    }
  }

  /**
   * Update the last run time for a worker
   *
   * @param workerName Name of the worker
   * @param timestamp ISO timestamp of the run time (default: current time)
   * @returns Whether the operation was successful
   */
  async updateWorkerRunTime(
    workerName: string,
    timestamp?: string,
  ): Promise<boolean> {
    try {
      this.validateConnection();
      const now = timestamp || new Date().toISOString();

      logger.debug("Updating worker run time", {
        workerName,
        timestamp: now,
      });

      // Check if worker entry exists
      const exists = await this.db
        .prepare(
          `
        SELECT 1 FROM worker_run_times WHERE worker_name = ?
      `,
        )
        .bind(workerName)
        .first<{ 1: number }>();

      let result;
      if (exists) {
        // Update existing entry
        result = await this.db
          .prepare(
            `
          UPDATE worker_run_times 
          SET last_run_time = ?, updated_at = ?
          WHERE worker_name = ?
        `,
          )
          .bind(now, now, workerName)
          .run();
      } else {
        // Insert new entry
        result = await this.db
          .prepare(
            `
          INSERT INTO worker_run_times (worker_name, last_run_time, updated_at)
          VALUES (?, ?, ?)
        `,
          )
          .bind(workerName, now, now)
          .run();
      }

      logger.debug("Updated worker run time", {
        workerName,
        timestamp: now,
        success: result.success,
      });

      return result.success;
    } catch (error) {
      logger.error("Error updating worker run time", { error, workerName });
      return false;
    }
  }

  /**
   * Check if enough time has passed since the last worker run
   *
   * @param workerName Name of the worker
   * @param intervalMinutes Minimum interval in minutes between runs
   * @returns Whether the worker should run
   */
  async shouldRunWorker(
    workerName: string,
    intervalMinutes: number,
  ): Promise<boolean> {
    try {
      this.validateConnection();
      const lastRunTime = await this.getLastWorkerRunTime(workerName);

      // If never run before, should run now
      if (!lastRunTime) {
        logger.debug("Worker has never run before", { workerName });
        return true;
      }

      const now = new Date().getTime();
      const lastRun = new Date(lastRunTime).getTime();
      const intervalMs = intervalMinutes * 60 * 1000;
      const timeSinceLastRun = now - lastRun;

      const shouldRun = timeSinceLastRun >= intervalMs;

      logger.debug("Checking if worker should run", {
        workerName,
        lastRunTime,
        intervalMinutes,
        timeSinceLastRun: Math.floor(timeSinceLastRun / 1000 / 60) + " minutes",
        shouldRun,
      });

      return shouldRun;
    } catch (error) {
      logger.error("Error checking if worker should run", {
        error,
        workerName,
      });
      // In case of error, default to running to be safe
      return true;
    }
  }

  async markForSummarizeRetry(
    id: HNStoryID,
    retryCount: number = 0,
    error?: string,
  ): Promise<boolean> {
    try {
      this.validateConnection();
      const now = new Date().toISOString();

      const result = await this.db
        .prepare(
          `
        UPDATE stories 
        SET status = ?, retry_count = ?, updated_at = ?, error = ?
        WHERE id = ?
      `,
        )
        .bind(
          ProcessingStatus.RETRY_SUMMARIZE,
          retryCount + 1,
          now,
          error || null,
          id,
        )
        .run();

      logger.debug("Marked story for summarization retry", {
        storyId: id,
        retryCount: retryCount + 1,
        success: result.success,
      });

      return result.success;
    } catch (error) {
      logger.error("Error marking story for summarization retry", {
        error,
        storyId: id,
      });
      return false;
    }
  }

  /**
   * Get stories for content processing in priority order
   *
   * @param limit Maximum number of stories to return
   * @returns Array of stories
   */
  async getStoriesForContentProcessing(limit = 10): Promise<ProcessedStory[]> {
    try {
      this.validateConnection();
      const MAX_RETRIES =
        ENV.get("MAX_RETRY_ATTEMPTS") || PROCESSING.RETRY.DEFAULT_MAX_RETRIES;

      // Get retry stories first (with retry count limit), then pending stories
      const results = await this.db
        .prepare(
          `
        SELECT * FROM stories 
        WHERE (status = ? AND retry_count < ?) OR status = ?
        ORDER BY 
          CASE 
            WHEN status = ? THEN 0 -- RETRY_EXTRACT gets priority
            ELSE 1                 -- PENDING comes second
          END,
          retry_count ASC,         -- Lower retry count first
          score DESC               -- Higher score stories first
        LIMIT ?
      `,
        )
        .bind(
          ProcessingStatus.RETRY_EXTRACT,
          MAX_RETRIES,
          ProcessingStatus.PENDING,
          ProcessingStatus.RETRY_EXTRACT,
          limit,
        )
        .all<StoriesRow>();

      return results.results.map((row) => this.mapRowToStory(row));
    } catch (error) {
      logger.error("Error getting stories for content processing", { error });
      return [];
    }
  }

  /**
   * Get stories for summary generation in priority order
   *
   * @param limit Maximum number of stories to return
   * @returns Array of stories
   */
  async getStoriesForSummaryGeneration(limit = 10): Promise<ProcessedStory[]> {
    try {
      this.validateConnection();
      const MAX_RETRIES =
        ENV.get("MAX_RETRY_ATTEMPTS") || PROCESSING.RETRY.DEFAULT_MAX_RETRIES;

      // Get retry stories first (with retry count limit), then extracted stories
      const results = await this.db
        .prepare(
          `
        SELECT * FROM stories 
        WHERE (status = ? AND retry_count < ?) OR status = ?
        ORDER BY 
          CASE 
            WHEN status = ? THEN 0 -- RETRY_SUMMARIZE gets priority
            ELSE 1                 -- EXTRACTED comes second
          END,
          retry_count ASC,         -- Lower retry count first
          score DESC               -- Higher score stories first
        LIMIT ?
      `,
        )
        .bind(
          ProcessingStatus.RETRY_SUMMARIZE,
          MAX_RETRIES,
          ProcessingStatus.EXTRACTED,
          ProcessingStatus.RETRY_SUMMARIZE,
          limit,
        )
        .all<StoriesRow>();

      return results.results.map((row) => this.mapRowToStory(row));
    } catch (error) {
      logger.error("Error getting stories for summary generation", { error });
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
      retryCount: row.retry_count || 0,
    };
  }
}

/**
 * Database row type for worker_run_times table
 */
interface WorkerRunTimesRow {
  worker_name: string;
  last_run_time: string;
  updated_at: string;
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
  retry_count: number | null;
}
