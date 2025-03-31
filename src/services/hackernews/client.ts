/**
 * HackerNews API Client
 *
 * This module provides functions for interacting with the HackerNews API.
 * It handles fetching top stories, getting story details, and managing
 * API rate limits.
 */

import { logger } from "../../utils/logger";
import { HNStory, HNStoryID } from "../../types/hackernews";
import { API } from "../../config/constants";

/**
 * HackerNews API client
 */
export class HackerNewsClient {
  private cacheTimeout: number;
  private topStoriesCache: { timestamp: number; data: HNStoryID[] } | null =
    null;

  /**
   * Create a new HackerNews API client
   *
   * @param cacheTimeout Cache timeout in milliseconds (default: 5 minutes)
   */
  constructor(cacheTimeout = API.HACKERNEWS.CACHE_TIMEOUT) {
    this.cacheTimeout = cacheTimeout;
  }

  /**
   * Fetch the top stories from HackerNews
   *
   * @param limit Maximum number of stories to fetch
   * @returns Array of story IDs
   */
  async getTopStories(
    limit = API.HACKERNEWS.DEFAULT_STORY_LIMIT,
  ): Promise<HNStoryID[]> {
    try {
      // Check if we have cached data that's still valid
      const now = Date.now();
      if (
        this.topStoriesCache &&
        now - this.topStoriesCache.timestamp < this.cacheTimeout
      ) {
        logger.debug("Using cached top stories");
        return this.topStoriesCache.data.slice(0, limit);
      }

      // Fetch top stories from the API
      const response = await fetch(
        `${API.HACKERNEWS.BASE_URL}/topstories.json`,
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch top stories: ${response.status} ${response.statusText}`,
        );
      }

      const data = (await response.json()) as HNStoryID[];

      // Update the cache
      this.topStoriesCache = {
        timestamp: now,
        data,
      };

      logger.info("Fetched top stories", { count: data.length });

      // Return the requested number of stories
      return data.slice(0, limit);
    } catch (error) {
      logger.error("Error fetching top stories", { error });
      throw error;
    }
  }

  /**
   * Fetch details for a specific story
   *
   * @param id Story ID
   * @returns Story details
   */
  async getStory(id: HNStoryID): Promise<HNStory> {
    try {
      const response = await fetch(
        `${API.HACKERNEWS.BASE_URL}/item/${id}.json`,
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch story ${id}: ${response.status} ${response.statusText}`,
        );
      }

      const story = (await response.json()) as HNStory;

      logger.debug("Fetched story details", { id, title: story.title });

      return story;
    } catch (error) {
      logger.error("Error fetching story details", { error, id });
      throw error;
    }
  }

  /**
   * Fetch details for multiple stories in parallel
   *
   * @param ids Array of story IDs
   * @param concurrency Maximum number of concurrent requests
   * @returns Array of story details
   */
  /**
   * Fetch details for multiple stories in parallel
   *
   * @param ids Array of story IDs
   * @param concurrency Maximum number of concurrent requests
   * @returns Array of story details
   */
  async getStories(
    ids: HNStoryID[],
    concurrency = API.HACKERNEWS.DEFAULT_CONCURRENCY,
  ): Promise<HNStory[]> {
    try {
      logger.info("Fetching details for multiple stories", {
        count: ids.length,
      });

      const results: HNStory[] = [];

      // Process stories in batches to control concurrency
      for (let i = 0; i < ids.length; i += concurrency) {
        const batch = ids.slice(i, i + concurrency);

        // Process each story in the batch sequentially to avoid rate limits
        for (const id of batch) {
          try {
            // Add a delay between requests to avoid rate limiting
            if (results.length > 0) {
              await new Promise((resolve) => setTimeout(resolve, 200)); // 200ms delay between requests
            }
            const story = await this.getStory(id);
            results.push(story);
          } catch (error) {
            logger.error("Error fetching story details", { error, id });
            // Continue with next story
          }
        }
      }

      logger.info("Finished fetching story details", {
        requested: ids.length,
        retrieved: results.length,
      });

      return results;
    } catch (error) {
      logger.error("Error fetching stories batch", {
        error,
        count: ids.length,
      });
      throw error;
    }
  }
}
