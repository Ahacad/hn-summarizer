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

    // Get the maximum number of stories to fetch - now guaranteed to be a number
    const maxStories = ENV.get("MAX_STORIES_PER_FETCH");

    logger.debug("Story fetcher configuration", {
      maxStories,
      maxStoriesType: typeof maxStories,
    });

    // Get top stories from HackerNews
    const storyIds = await hnClient.getTopStories(maxStories);
    logger.info("Fetched top story IDs", { count: storyIds.length });

    // Fetch detailed information for each story
    const stories = await hnClient.getStories(storyIds);
    logger.info("Fetched story details", { count: stories.length });

    // Process each story
    let newCount = 0;
    let updatedCount = 0;
    let scoreUpdatedCount = 0;

    for (const story of stories) {
      // Skip non-story items or items without URLs (text posts)
      if (story.type !== "story" || !story.url) {
        continue;
      }

      // Check if the story already exists and get its current data
      const existingStory = await storyRepo.getStory(story.id);
      const exists = !!existingStory;

      // For existing stories, preserve their current status and other metadata
      // For new stories, set to PENDING
      const status = exists ? existingStory.status : ProcessingStatus.PENDING;
      const scoreChanged = exists && existingStory.score !== story.score;

      // Create or update the story
      const success = await storyRepo.saveStory({
        id: story.id,
        title: story.title,
        url: story.url,
        by: story.by,
        time: story.time,
        score: story.score,
        status: status,
        contentId: exists ? existingStory.contentId : undefined,
        summaryId: exists ? existingStory.summaryId : undefined,
        processedAt: exists
          ? existingStory.processedAt
          : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: exists ? existingStory.error : undefined,
        retryCount: exists ? existingStory.retryCount : 0,
      });

      if (success) {
        if (exists) {
          updatedCount++;
          if (scoreChanged) {
            scoreUpdatedCount++;
            logger.debug("Updated story score", {
              storyId: story.id,
              oldScore: existingStory.score,
              newScore: story.score,
              changeAmount: story.score - existingStory.score,
            });
          }
        } else {
          newCount++;
        }
      }
    }

    logger.info("Story fetcher completed", {
      new: newCount,
      updated: updatedCount,
      scoreUpdated: scoreUpdatedCount,
      total: stories.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        new: newCount,
        updated: updatedCount,
        scoreUpdated: scoreUpdatedCount,
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
