/**
 * Notification Sender Worker
 *
 * This worker sends notifications for completed summaries to configured channels.
 * It handles Telegram and Discord notifications based on application configuration.
 */

import { StoryRepository } from "../storage/d1/story-repository";
import { ContentRepository } from "../storage/r2/content-repository";
import { ProcessingStatus } from "../types/story";
import { TelegramNotifier } from "../services/notifications/telegram";
import { DiscordNotifier } from "../services/notifications/discord";
import { logger } from "../utils/logger";
import { HackerNewsClient } from "../services/hackernews/client";
import { NotificationStatus } from "../types/summary";
import { ENV } from "../config/environment";

/**
 * Handler for the notification sender worker
 */
export async function notificationSenderHandler(
  request: Request,
  env: any,
  ctx: ExecutionContext,
): Promise<Response> {
  try {
    logger.info("Starting notification sender worker");

    // Initialize dependencies
    const storyRepo = new StoryRepository();
    const contentRepo = new ContentRepository();
    const telegramNotifier = new TelegramNotifier();
    const discordNotifier = new DiscordNotifier();
    const hnClient = new HackerNewsClient();

    // Get batch size and concurrency from environment (now guaranteed to be numbers)
    const batchSize = ENV.get("NOTIFICATION_SENDER_BATCH_SIZE");
    const concurrencyLimit = ENV.get("NOTIFICATION_SENDER_CONCURRENCY");

    logger.debug("Notification sender configuration", {
      batchSize,
      concurrencyLimit,
    });

    // Get completed stories that haven't been sent yet
    const stories = await storyRepo.getStoriesByStatus(
      ProcessingStatus.COMPLETED,
      batchSize,
    );
    logger.info("Found completed stories for notification", {
      count: stories.length,
    });

    // Process stories with controlled concurrency
    const results = await processStoriesWithConcurrency(
      stories,
      concurrencyLimit,
      telegramNotifier,
      discordNotifier,
      contentRepo,
      storyRepo,
      hnClient,
    );

    logger.info("Notification sender completed", { results });

    return new Response(
      JSON.stringify({
        success: true,
        results,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    logger.error("Error in notification sender worker", { error });

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
 * @param telegramNotifier Telegram notification service
 * @param discordNotifier Discord notification service
 * @param contentRepo Content repository
 * @param storyRepo Story repository
 * @param hnClient HackerNews client
 * @returns Results object
 */
async function processStoriesWithConcurrency(
  stories,
  concurrencyLimit,
  telegramNotifier,
  discordNotifier,
  contentRepo,
  storyRepo,
  hnClient,
) {
  // Initialize results
  const results = {
    telegram: {
      sent: 0,
      failed: 0,
      skipped: 0,
    },
    discord: {
      sent: 0,
      failed: 0,
      skipped: 0,
    },
    storyStatusUpdated: 0,
  };

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
      processStory(
        story,
        telegramNotifier,
        discordNotifier,
        contentRepo,
        storyRepo,
        hnClient,
      ),
    );

    // Wait for this entire batch to complete before moving to the next batch
    const batchResults = await Promise.allSettled(batchPromises);

    // Process the results
    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        const storyResult = result.value;

        // Aggregate results
        results.telegram.sent += storyResult.telegram.sent ? 1 : 0;
        results.telegram.failed += storyResult.telegram.failed ? 1 : 0;
        results.telegram.skipped += storyResult.telegram.skipped ? 1 : 0;

        results.discord.sent += storyResult.discord.sent ? 1 : 0;
        results.discord.failed += storyResult.discord.failed ? 1 : 0;
        results.discord.skipped += storyResult.discord.skipped ? 1 : 0;

        results.storyStatusUpdated += storyResult.statusUpdated ? 1 : 0;
      } else {
        logger.error("Error in batch processing promise", {
          error: result.reason,
        });
        // Count as failed for both channels
        results.telegram.failed++;
        results.discord.failed++;
      }
    }

    logger.debug(
      `Completed batch ${Math.floor(i / limit) + 1}/${Math.ceil(stories.length / limit)}`,
      {
        batchTelegramSent: batchResults.filter(
          (r) => r.status === "fulfilled" && r.value.telegram.sent,
        ).length,
        batchDiscordSent: batchResults.filter(
          (r) => r.status === "fulfilled" && r.value.discord.sent,
        ).length,
        batchStoryStatusUpdated: batchResults.filter(
          (r) => r.status === "fulfilled" && r.value.statusUpdated,
        ).length,
      },
    );
  }

  return results;
}

/**
 * Process a single story for notifications
 */
async function processStory(
  story,
  telegramNotifier,
  discordNotifier,
  contentRepo,
  storyRepo,
  hnClient,
) {
  // Initialize result for this story
  const result = {
    telegram: { sent: false, failed: false, skipped: false },
    discord: { sent: false, failed: false, skipped: false },
    statusUpdated: false,
  };

  try {
    // Ensure we have a summary ID
    if (!story.summaryId) {
      logger.warn("Story has no summary ID, skipping", { storyId: story.id });
      result.telegram.skipped = true;
      result.discord.skipped = true;
      return result;
    }

    // Get the summary from R2
    const summary = await contentRepo.getSummary(story.summaryId);

    if (!summary) {
      logger.warn("Failed to retrieve summary", {
        storyId: story.id,
        summaryId: story.summaryId,
      });
      result.telegram.skipped = true;
      result.discord.skipped = true;
      return result;
    }

    // Get the full story details from HackerNews
    const fullStory = await hnClient.getStory(story.id);

    // Track if notifications were successfully sent to any channel
    let notificationSentSuccessfully = false;

    // Send notifications to configured channels

    // Telegram
    if (telegramNotifier.isConfigured()) {
      try {
        const success = await telegramNotifier.sendSummary(fullStory, summary);

        if (success) {
          result.telegram.sent = true;
          logger.info("Sent summary to Telegram", { storyId: story.id });
          notificationSentSuccessfully = true;
        } else {
          result.telegram.failed = true;
          logger.warn("Failed to send summary to Telegram", {
            storyId: story.id,
          });
        }
      } catch (error) {
        result.telegram.failed = true;
        logger.error("Error sending to Telegram", {
          error,
          storyId: story.id,
        });
      }
    } else {
      result.telegram.skipped = true;
    }

    // Discord
    if (discordNotifier.isConfigured()) {
      try {
        const success = await discordNotifier.sendSummary(fullStory, summary);

        if (success) {
          result.discord.sent = true;
          logger.info("Sent summary to Discord", { storyId: story.id });
          notificationSentSuccessfully = true;
        } else {
          result.discord.failed = true;
          logger.warn("Failed to send summary to Discord", {
            storyId: story.id,
          });
        }
      } catch (error) {
        result.discord.failed = true;
        logger.error("Error sending to Discord", {
          error,
          storyId: story.id,
        });
      }
    } else {
      result.discord.skipped = true;
    }

    // Update story status to SENT if at least one notification channel was successful
    if (notificationSentSuccessfully) {
      await storyRepo.updateStatus(story.id, ProcessingStatus.SENT);
      result.statusUpdated = true;
      logger.info("Updated story status to SENT", { storyId: story.id });
    }
  } catch (error) {
    logger.error("Error processing notification for story", {
      error,
      storyId: story.id,
    });
    result.telegram.failed = true;
    result.discord.failed = true;
  }

  return result;
}
