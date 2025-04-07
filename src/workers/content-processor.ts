/**
 * Content Processor Worker
 *
 * This worker extracts content from story URLs and saves it to R2.
 * It processes stories that have been fetched but not yet extracted.
 * Uses Cloudflare Workers' browser utilities for content extraction.
 */

import { ContentExtractor } from "../services/content/extractor";
import { StoryRepository } from "../storage/d1/story-repository";
import { ContentRepository } from "../storage/r2/content-repository";
import { ProcessingStatus } from "../types/story";
import { logger } from "../utils/logger";
import { ENV } from "../config/environment";
import { PROCESSING } from "../config/constants";

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
      batchSizeType: typeof batchSize,
      concurrencyLimitType: typeof concurrencyLimit,
    });

    // Get stories to process in priority order (retries first, then new)
    const stories = await storyRepo.getStoriesForContentProcessing(batchSize);

    // Count retries vs pending stories for logging
    const retryCount = stories.filter(
      (s) => s.status === ProcessingStatus.RETRY_EXTRACT,
    ).length;
    const pendingCount = stories.length - retryCount;

    logger.info("Found stories to process", {
      count: stories.length,
      pending: pendingCount,
      retry: retryCount,
    });

    // Process stories with controlled concurrency
    const {
      successCount,
      failureCount,
      retryCount: newRetryCount,
    } = await processStoriesWithConcurrency(
      stories,
      concurrencyLimit,
      contentExtractor,
      storyRepo,
      contentRepo,
    );

    logger.info("Content processor completed", {
      success: successCount,
      failure: failureCount,
      retry: newRetryCount,
      total: stories.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        processed: successCount,
        failed: failureCount,
        retried: newRetryCount,
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
  let retryCount = 0;

  // Ensure concurrencyLimit is a valid number
  const limit = Math.max(1, concurrencyLimit);

  logger.debug("Processing with controlled concurrency", {
    totalStories: stories.length,
    concurrencyLimit: limit,
  });

  // Process stories in batches to control concurrency
  for (let i = 0; i < stories.length; i += limit) {
    const batch = stories.slice(i, i + limit);

    logger.debug(`Processing batch of ${batch.length} stories`, {
      batchNumber: Math.floor(i / limit) + 1,
      totalBatches: Math.ceil(stories.length / limit),
      startIndex: i,
      endIndex: Math.min(i + limit - 1, stories.length - 1),
    });

    // Create processing promises for this batch
    const batchPromises = batch.map((story) =>
      processStory(story, contentExtractor, storyRepo, contentRepo),
    );

    // Wait for this entire batch to complete before moving to the next batch
    const batchResults = await Promise.allSettled(batchPromises);

    // Process the results
    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        if (result.value.success) {
          successCount++;
        } else if (result.value.retry) {
          retryCount++;
        } else {
          failureCount++;
        }
      } else {
        logger.error("Error in batch processing promise", {
          error: result.reason,
        });
        failureCount++;
      }
    }

    logger.debug(
      `Completed batch ${Math.floor(i / limit) + 1}/${Math.ceil(stories.length / limit)}`,
      {
        batchSuccesses: batchResults.filter(
          (r) => r.status === "fulfilled" && r.value.success,
        ).length,
        batchFailures: batchResults.filter(
          (r) =>
            r.status === "rejected" ||
            (r.status === "fulfilled" && !r.value.success && !r.value.retry),
        ).length,
        batchRetries: batchResults.filter(
          (r) => r.status === "fulfilled" && r.value.retry,
        ).length,
      },
    );
  }

  return { successCount, failureCount, retryCount };
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
    // Get current retry count if any
    const retryCount = story.retryCount || 0;
    const MAX_RETRIES =
      ENV.get("MAX_RETRY_ATTEMPTS") || PROCESSING.RETRY.DEFAULT_MAX_RETRIES;

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
      return { success: false, retry: false };
    }

    // Extract content
    const content = await contentExtractor.extract(story.url);

    if (!content) {
      logger.warn("Failed to extract content", {
        storyId: story.id,
        url: story.url,
        retryCount,
      });

      // Check if we should retry
      if (retryCount < MAX_RETRIES) {
        await storyRepo.markForExtractRetry(
          story.id,
          retryCount,
          "Failed to extract content - will retry",
        );
        return { success: false, retry: true };
      } else {
        // Max retries reached, mark as failed
        await storyRepo.updateStatus(
          story.id,
          ProcessingStatus.FAILED,
          `Failed to extract content after ${MAX_RETRIES} retries`,
        );
        return { success: false, retry: false };
      }
    }

    // Save content to R2
    const contentId = await contentRepo.saveContent(story.id, content);

    if (!contentId) {
      logger.error("Failed to save content to R2", { storyId: story.id });

      // Check if we should retry
      if (retryCount < MAX_RETRIES) {
        await storyRepo.markForExtractRetry(
          story.id,
          retryCount,
          "Failed to save content - will retry",
        );
        return { success: false, retry: true };
      } else {
        // Max retries reached, mark as failed
        await storyRepo.updateStatus(
          story.id,
          ProcessingStatus.FAILED,
          `Failed to save content after ${MAX_RETRIES} retries`,
        );
        return { success: false, retry: false };
      }
    }

    // Update story with content ID and status
    await storyRepo.updateContentId(story.id, contentId);
    await storyRepo.updateStatus(story.id, ProcessingStatus.EXTRACTED);

    logger.info("Successfully processed story content", {
      storyId: story.id,
      contentId,
      wordCount: content.wordCount,
      retryAttempt: retryCount > 0 ? retryCount : undefined,
    });

    return { success: true, retry: false };
  } catch (error) {
    logger.error("Error processing story content", {
      error,
      storyId: story.id,
      retryCount: story.retryCount || 0,
    });

    const retryCount = story.retryCount || 0;
    const MAX_RETRIES =
      ENV.get("MAX_RETRY_ATTEMPTS") || PROCESSING.RETRY.DEFAULT_MAX_RETRIES;

    // Check if we should retry
    if (retryCount < MAX_RETRIES) {
      await storyRepo.markForExtractRetry(
        story.id,
        retryCount,
        `Error: ${error.message} - will retry`,
      );
      return { success: false, retry: true };
    } else {
      await storyRepo.updateStatus(
        story.id,
        ProcessingStatus.FAILED,
        `Error: ${error.message} - max retries reached`,
      );
      return { success: false, retry: false };
    }
  }
}
