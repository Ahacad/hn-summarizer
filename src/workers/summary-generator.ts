/**
 * Summary Generator Worker
 *
 * This worker generates summaries for stories that have had their content extracted.
 * It processes stories that are in the EXTRACTED state and moves them to COMPLETED
 * upon successful summarization.
 */

import { GoogleAISummarizer } from "../services/summarization/google-ai";
import { StoryRepository } from "../storage/d1/story-repository";
import { ContentRepository } from "../storage/r2/content-repository";
import { ProcessingStatus } from "../types/story";
import { logger } from "../utils/logger";
import { ENV } from "../config/environment";
import { PROCESSING } from "../config/constants";

/**
 * Handler for the summary generator worker
 */
export async function summaryGeneratorHandler(
  request: Request,
  env: any,
  ctx: ExecutionContext,
): Promise<Response> {
  try {
    logger.info("Starting summary generator worker");

    // Initialize dependencies
    const summarizer = new GoogleAISummarizer(
      undefined,
      ENV.get("SUMMARIZATION_MAX_TOKENS"),
    );
    const storyRepo = new StoryRepository();
    const contentRepo = new ContentRepository();

    // Get batch size and concurrency from environment (now guaranteed to be a number)
    const batchSize = ENV.get("SUMMARY_GENERATOR_BATCH_SIZE");
    const concurrencyLimit = ENV.get("SUMMARY_GENERATOR_CONCURRENCY");

    logger.debug("Summary generator configuration", {
      batchSize,
      concurrencyLimit,
      maxTokens: ENV.get("SUMMARIZATION_MAX_TOKENS"),
    });

    // Get stories for summarization in priority order (retries first, then new)
    const stories = await storyRepo.getStoriesForSummaryGeneration(batchSize);

    // Count retries vs extracted stories for logging
    const retryCount = stories.filter(
      (s) => s.status === ProcessingStatus.RETRY_SUMMARIZE,
    ).length;
    const extractedCount = stories.length - retryCount;

    logger.info("Found stories to summarize", {
      count: stories.length,
      extracted: extractedCount,
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
      summarizer,
      storyRepo,
      contentRepo,
    );

    logger.info("Summary generator completed", {
      success: successCount,
      failure: failureCount,
      retry: newRetryCount,
      total: stories.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        summarized: successCount,
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
    logger.error("Error in summary generator worker", { error });

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
 * @param summarizer Summarization service
 * @param storyRepo Story repository
 * @param contentRepo Content repository
 * @returns Object with success and failure counts
 */
async function processStoriesWithConcurrency(
  stories,
  concurrencyLimit,
  summarizer,
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
      processStory(story, summarizer, storyRepo, contentRepo),
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
 * @param summarizer Summarization service
 * @param storyRepo Story repository
 * @param contentRepo Content repository
 * @returns Object indicating success or failure
 */
async function processStory(story, summarizer, storyRepo, contentRepo) {
  try {
    // Get current retry count if any
    const currentRetryCount = story.retryCount || 0;
    const MAX_RETRIES =
      ENV.get("MAX_RETRY_ATTEMPTS") || PROCESSING.RETRY.DEFAULT_MAX_RETRIES;

    // Update status to summarizing
    await storyRepo.updateStatus(story.id, ProcessingStatus.SUMMARIZING);

    // Ensure we have a content ID
    if (!story.contentId) {
      logger.warn("Story has no content ID", { storyId: story.id });
      await storyRepo.updateStatus(
        story.id,
        ProcessingStatus.FAILED,
        "No content ID available",
      );
      return { success: false, retry: false };
    }

    // Get the content from R2
    const content = await contentRepo.getContent(story.contentId);

    if (!content) {
      logger.warn("Failed to retrieve content", {
        storyId: story.id,
        contentId: story.contentId,
      });

      // Check if we should retry
      if (currentRetryCount < MAX_RETRIES) {
        await storyRepo.markForSummarizeRetry(
          story.id,
          currentRetryCount,
          "Failed to retrieve content - will retry",
        );
        return { success: false, retry: true };
      } else {
        await storyRepo.updateStatus(
          story.id,
          ProcessingStatus.FAILED,
          `Failed to retrieve content after ${MAX_RETRIES} retries`,
        );
        return { success: false, retry: false };
      }
    }

    // Some contents may have missing titles, use the story title as fallback
    const title = content.title || story.title;

    try {
      // Generate summary
      const summary = await summarizer.summarize(
        story.id,
        title,
        content.content,
        content.wordCount,
      );

      // Save summary to R2
      const summaryId = await contentRepo.saveSummary(story.id, summary);

      if (!summaryId) {
        logger.error("Failed to save summary to R2", { storyId: story.id });

        // Check if we should retry
        if (currentRetryCount < MAX_RETRIES) {
          await storyRepo.markForSummarizeRetry(
            story.id,
            currentRetryCount,
            "Failed to save summary - will retry",
          );
          return { success: false, retry: true };
        } else {
          await storyRepo.updateStatus(
            story.id,
            ProcessingStatus.FAILED,
            `Failed to save summary after ${MAX_RETRIES} retries`,
          );
          return { success: false, retry: false };
        }
      }

      // Update story with summary ID and status
      await storyRepo.updateSummaryId(story.id, summaryId);
      await storyRepo.updateStatus(story.id, ProcessingStatus.COMPLETED);

      logger.info("Successfully generated summary", {
        storyId: story.id,
        summaryId,
        summaryLength: summary.summary.length,
        retryAttempt: currentRetryCount > 0 ? currentRetryCount : undefined,
      });

      return { success: true, retry: false };
    } catch (error) {
      logger.error("Error generating summary", {
        error,
        storyId: story.id,
      });

      // Check if we should retry
      if (currentRetryCount < MAX_RETRIES) {
        await storyRepo.markForSummarizeRetry(
          story.id,
          currentRetryCount,
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
  } catch (error) {
    logger.error("Error processing story", { error, storyId: story.id });

    const currentRetryCount = story.retryCount || 0;
    const MAX_RETRIES =
      ENV.get("MAX_RETRY_ATTEMPTS") || PROCESSING.RETRY.DEFAULT_MAX_RETRIES;

    // Check if we should retry
    if (currentRetryCount < MAX_RETRIES) {
      await storyRepo.markForSummarizeRetry(
        story.id,
        currentRetryCount,
        `Unexpected error: ${error.message} - will retry`,
      );
      return { success: false, retry: true };
    } else {
      await storyRepo.updateStatus(
        story.id,
        ProcessingStatus.FAILED,
        `Unexpected error: ${error.message} - max retries reached`,
      );
      return { success: false, retry: false };
    }
  }
}
