/**
 * HackerNews API Client
 * 
 * This module provides functions for interacting with the HackerNews API.
 * It handles fetching top stories, getting story details, and managing
 * API rate limits.
 */

import { logger } from '../../utils/logger';
import { HNStory, HNStoryID } from '../../types/hackernews';

// Base URL for the HackerNews API
const HN_API_BASE = 'https://hacker-news.firebaseio.com/v0';

/**
 * HackerNews API client
 */
export class HackerNewsClient {
  private cacheTimeout: number;
  private topStoriesCache: { timestamp: number; data: HNStoryID[] } | null = null;
  
  /**
   * Create a new HackerNews API client
   * 
   * @param cacheTimeout Cache timeout in milliseconds (default: 5 minutes)
   */
  constructor(cacheTimeout = 5 * 60 * 1000) {
    this.cacheTimeout = cacheTimeout;
  }
  
  /**
   * Fetch the top stories from HackerNews
   * 
   * @param limit Maximum number of stories to fetch
   * @returns Array of story IDs
   */
  async getTopStories(limit = 30): Promise<HNStoryID[]> {
    try {
      // Check if we have cached data that's still valid
      const now = Date.now();
      if (this.topStoriesCache && (now - this.topStoriesCache.timestamp) < this.cacheTimeout) {
        logger.debug('Using cached top stories');
        return this.topStoriesCache.data.slice(0, limit);
      }
      
      // Fetch top stories from the API
      const response = await fetch(`${HN_API_BASE}/topstories.json`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch top stories: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json() as HNStoryID[];
      
      // Update the cache
      this.topStoriesCache = {
        timestamp: now,
        data
      };
      
      logger.info('Fetched top stories', { count: data.length });
      
      // Return the requested number of stories
      return data.slice(0, limit);
    } catch (error) {
      logger.error('Error fetching top stories', { error });
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
      const response = await fetch(`${HN_API_BASE}/item/${id}.json`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch story ${id}: ${response.status} ${response.statusText}`);
      }
      
      const story = await response.json() as HNStory;
      
      logger.debug('Fetched story details', { id, title: story.title });
      
      return story;
    } catch (error) {
      logger.error('Error fetching story details', { error, id });
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
  async getStories(ids: HNStoryID[], concurrency = 5): Promise<HNStory[]> {
    logger.info('Fetching details for multiple stories', { count: ids.length });
    
    const results: HNStory[] = [];
    
    // Process stories in batches to control concurrency
    for (let i = 0; i < ids.length; i += concurrency) {
      const batch = ids.slice(i, i + concurrency);
      const batchPromises = batch.map(id => this.getStory(id));
      
      // Wait for the current batch to complete
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Process the results
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        }
      }
    }
    
    logger.info('Finished fetching story details', { 
      requested: ids.length, 
      retrieved: results.length 
    });
    
    return results;
  }
}
