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

    // Get completed stories
    const stories = await storyRepo.getStoriesByStatus(
      ProcessingStatus.COMPLETED,
      5,
    );
    logger.info("Found completed stories for notification", {
      count: stories.length,
    });

    // Track results
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
    };

    // Process each story
    for (const story of stories) {
      try {
        // Ensure we have a summary ID
        if (!story.summaryId) {
          logger.warn("Story has no summary ID, skipping", {
            storyId: story.id,
          });
          results.telegram.skipped++;
          results.discord.skipped++;
          continue;
        }

        // Get the summary from R2
        const summary = await contentRepo.getSummary(story.summaryId);

        if (!summary) {
          logger.warn("Failed to retrieve summary", {
            storyId: story.id,
            summaryId: story.summaryId,
          });
          results.telegram.skipped++;
          results.discord.skipped++;
          continue;
        }

        // Get the full story details from HackerNews
        const fullStory = await hnClient.getStory(story.id);

        // Send notifications to configured channels

        // Telegram
        if (telegramNotifier.isConfigured()) {
          try {
            const success = await telegramNotifier.sendSummary(
              fullStory,
              summary,
            );

            if (success) {
              results.telegram.sent++;
              logger.info("Sent summary to Telegram", { storyId: story.id });
            } else {
              results.telegram.failed++;
              logger.warn("Failed to send summary to Telegram", {
                storyId: story.id,
              });
            }
          } catch (error) {
            results.telegram.failed++;
            logger.error("Error sending to Telegram", {
              error,
              storyId: story.id,
            });
          }
        } else {
          results.telegram.skipped++;
        }

        // Discord
        if (discordNotifier.isConfigured()) {
          try {
            const success = await discordNotifier.sendSummary(
              fullStory,
              summary,
            );

            if (success) {
              results.discord.sent++;
              logger.info("Sent summary to Discord", { storyId: story.id });
            } else {
              results.discord.failed++;
              logger.warn("Failed to send summary to Discord", {
                storyId: story.id,
              });
            }
          } catch (error) {
            results.discord.failed++;
            logger.error("Error sending to Discord", {
              error,
              storyId: story.id,
            });
          }
        } else {
          results.discord.skipped++;
        }

        // TODO: In a future enhancement, we would store notification status in the database
        // For now, we just log the results
      } catch (error) {
        logger.error("Error processing notification for story", {
          error,
          storyId: story.id,
        });
        results.telegram.failed++;
        results.discord.failed++;
      }
    }

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
