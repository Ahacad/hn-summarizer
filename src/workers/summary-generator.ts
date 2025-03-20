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
import { HackerNewsClient } from "../services/hackernews/client";

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
    const hnClient = new HackerNewsClient();

    // Get batch size from environment
    const batchSize = ENV.get("SUMMARY_GENERATOR_BATCH_SIZE");

    logger.debug("Summary generator configuration", {
      batchSize,
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

    // Process each story
    let successCount = 0;
    let failureCount = 0;
    let newRetryCount = 0;

    for (const story of stories) {
      try {
        // Get current retry count if any
        const currentRetryCount = story.retryCount || 0;
        const MAX_RETRIES =
          ENV.get("MAX_RETRY_ATTEMPTS") || PROCESSING.RETRY.DEFAULT_MAX_RETRIES;

        // Update status to summarizing
        await storyRepo.updateStatus(story.id, ProcessingStatus.SUMMARIZING);

        // Ensure we have a content ID
        if (!story.contentId) {
          logger.warn("Story has no content ID, skipping", {
            storyId: story.id,
          });
          await storyRepo.updateStatus(
            story.id,
            ProcessingStatus.FAILED,
            "No content ID available",
          );
          failureCount++;
          continue;
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
            newRetryCount++;
          } else {
            await storyRepo.updateStatus(
              story.id,
              ProcessingStatus.FAILED,
              `Failed to retrieve content after ${MAX_RETRIES} retries`,
            );
            failureCount++;
          }
          continue;
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
              newRetryCount++;
            } else {
              await storyRepo.updateStatus(
                story.id,
                ProcessingStatus.FAILED,
                `Failed to save summary after ${MAX_RETRIES} retries`,
              );
              failureCount++;
            }
            continue;
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

          successCount++;
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
            newRetryCount++;
          } else {
            await storyRepo.updateStatus(
              story.id,
              ProcessingStatus.FAILED,
              `Error: ${error.message} - max retries reached`,
            );
            failureCount++;
          }
        }
      } catch (error) {
        logger.error("Error processing story", { error, storyId: story.id });
        failureCount++;
      }
    }

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
