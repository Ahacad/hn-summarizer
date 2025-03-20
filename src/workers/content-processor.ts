/**
 * Content Processor Worker
 *
 * This worker extracts content from story URLs and saves it to R2.
 * It processes stories that have been fetched but not yet extracted.
 */

import { ContentExtractor } from "../services/content/extractor";
import { StoryRepository } from "../storage/d1/story-repository";
import { ContentRepository } from "../storage/r2/content-repository";
import { ProcessingStatus } from "../types/story";
import { logger } from "../utils/logger";
import { ENV } from "../config/environment";

// Default concurrency limit
const DEFAULT_CONCURRENCY = 5;

/**
 * Handler for the content processor worker
 */
export async function contentProcessorHandler(
  request: Request,
  env: any,
  ctx: ExecutionContext,
): Promise<Response> {
  try {
    logger.info("Starting content processor worker");

    // Initialize dependencies
    const contentExtractor = new ContentExtractor();
    const storyRepo = new StoryRepository();
    const contentRepo = new ContentRepository();

    // Get batch size and concurrency limits from environment
    const batchSize = ENV.get("CONTENT_PROCESSOR_BATCH_SIZE");
    const concurrencyLimit = ENV.get("CONTENT_PROCESSOR_CONCURRENCY");

    logger.debug("Content processor configuration", {
      batchSize,
      concurrencyLimit,
    });

    // Get stories that need processing
    const stories = await storyRepo.getStoriesByStatus(
      ProcessingStatus.PENDING,
      batchSize,
    );
    logger.info("Found stories to process", { count: stories.length });

    // Process stories with controlled concurrency
    const { successCount, failureCount } = await processStoriesWithConcurrency(
      stories,
      concurrencyLimit,
      contentExtractor,
      storyRepo,
      contentRepo,
    );

    logger.info("Content processor completed", {
      success: successCount,
      failure: failureCount,
      total: stories.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        processed: successCount,
        failed: failureCount,
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
    logger.error("Error in content processor worker", { error });

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

/**
 * Process stories with controlled concurrency
 *
 * @param stories Stories to process
 * @param concurrencyLimit Maximum number of concurrent operations
 * @param contentExtractor Content extractor service
 * @param storyRepo Story repository
 * @param contentRepo Content repository
 * @returns Object with success and failure counts
 */
async function processStoriesWithConcurrency(
  stories,
  concurrencyLimit,
  contentExtractor,
  storyRepo,
  contentRepo,
) {
  let successCount = 0;
  let failureCount = 0;

  // Process stories in batches to control concurrency
  for (let i = 0; i < stories.length; i += concurrencyLimit) {
    const batch = stories.slice(i, i + concurrencyLimit);

    logger.debug(`Processing batch of ${batch.length} stories`, {
      batchNumber: Math.floor(i / concurrencyLimit) + 1,
      totalBatches: Math.ceil(stories.length / concurrencyLimit),
    });

    // Create processing promises for this batch
    const batchPromises = batch.map((story) =>
      processStory(story, contentExtractor, storyRepo, contentRepo),
    );

    // Wait for the current batch to complete
    const batchResults = await Promise.allSettled(batchPromises);

    // Process the results
    for (const result of batchResults) {
      if (result.status === "fulfilled" && result.value.success) {
        successCount++;
      } else {
        failureCount++;
      }
    }
  }

  return { successCount, failureCount };
}

/**
 * Process a single story
 *
 * @param story Story to process
 * @param contentExtractor Content extractor service
 * @param storyRepo Story repository
 * @param contentRepo Content repository
 * @returns Object indicating success or failure
 */
async function processStory(story, contentExtractor, storyRepo, contentRepo) {
  try {
    // Update status to extracting
    await storyRepo.updateStatus(story.id, ProcessingStatus.EXTRACTING);

    // Skip if no URL
    if (!story.url) {
      logger.warn("Story has no URL, skipping", { storyId: story.id });
      await storyRepo.updateStatus(
        story.id,
        ProcessingStatus.FAILED,
        "No URL provided",
      );
      return { success: false };
    }

    // Extract content
    const content = await contentExtractor.extract(story.url);

    if (!content) {
      logger.warn("Failed to extract content", {
        storyId: story.id,
        url: story.url,
      });
      await storyRepo.updateStatus(
        story.id,
        ProcessingStatus.FAILED,
        "Failed to extract content",
      );
      return { success: false };
    }

    // Save content to R2
    const contentId = await contentRepo.saveContent(story.id, content);

    if (!contentId) {
      logger.error("Failed to save content to R2", { storyId: story.id });
      await storyRepo.updateStatus(
        story.id,
        ProcessingStatus.FAILED,
        "Failed to save content",
      );
      return { success: false };
    }

    // Update story with content ID and status
    await storyRepo.updateContentId(story.id, contentId);
    await storyRepo.updateStatus(story.id, ProcessingStatus.EXTRACTED);

    logger.info("Successfully processed story content", {
      storyId: story.id,
      contentId,
      wordCount: content.wordCount,
    });

    return { success: true };
  } catch (error) {
    logger.error("Error processing story content", {
      error,
      storyId: story.id,
    });
    await storyRepo.updateStatus(
      story.id,
      ProcessingStatus.FAILED,
      `Error: ${error.message}`,
    );
    return { success: false };
  }
}
