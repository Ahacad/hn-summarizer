/**
 * Story Fetcher Worker
 *
 * This worker fetches new stories from HackerNews and saves them to the database.
 * It runs periodically to keep the story list up to date.
 */

import { HackerNewsClient } from "../services/hackernews/client";
import { StoryRepository } from "../storage/d1/story-repository";
import { ProcessingStatus } from "../types/story";
import { logger } from "../utils/logger";
import { ENV } from "../config/environment";

/**
 * Handler for the story fetcher worker
 */
export async function storyFetcherHandler(
  request: Request,
  env: any,
  ctx: ExecutionContext,
): Promise<Response> {
  try {
    logger.info("Starting story fetcher worker");

    // Initialize dependencies
    const hnClient = new HackerNewsClient();
    const storyRepo = new StoryRepository();

    // Get the maximum number of stories to fetch
    const maxStories = ENV.get("MAX_STORIES_PER_FETCH") || 30;

    // Get top stories from HackerNews
    const storyIds = await hnClient.getTopStories(maxStories);
    logger.info("Fetched top story IDs", { count: storyIds.length });

    // Fetch detailed information for each story
    const stories = await hnClient.getStories(storyIds);
    logger.info("Fetched story details", { count: stories.length });

    // Process each story
    let newCount = 0;
    let updatedCount = 0;

    for (const story of stories) {
      // Skip non-story items or items without URLs (text posts)
      if (story.type !== "story" || !story.url) {
        continue;
      }

      // Check if the story already exists
      const exists = await storyRepo.exists(story.id);

      // Create or update the story
      const success = await storyRepo.saveStory({
        id: story.id,
        title: story.title,
        url: story.url,
        by: story.by,
        time: story.time,
        score: story.score,
        status: exists ? ProcessingStatus.PENDING : ProcessingStatus.PENDING,
        processedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      if (success) {
        if (exists) {
          updatedCount++;
        } else {
          newCount++;
        }
      }
    }

    logger.info("Story fetcher completed", {
      new: newCount,
      updated: updatedCount,
      total: stories.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        new: newCount,
        updated: updatedCount,
        total: stories.length,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    logger.error("Error in story fetcher worker", { error });

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
}
