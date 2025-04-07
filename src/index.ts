/**
 * HackerNews Summarizer - Main Entry Point
 *
 * This is the main entry point for the Cloudflare Worker that powers
 * the HackerNews Summarizer application. It routes incoming requests
 * to the appropriate handlers and initializes the scheduled jobs.
 */

import { Router } from "./api/router";
import { storyFetcherHandler } from "./workers/story-fetcher";
import { contentProcessorHandler } from "./workers/content-processor";
import { summaryGeneratorHandler } from "./workers/summary-generator";
import { notificationSenderHandler } from "./workers/notification-sender";
import { dailyDigestHandler } from "./workers/daily-digest";
import { storiesHandler } from "./api/routes/stories";
import { summariesHandler } from "./api/routes/summaries";
import { workersHandler } from "./api/routes/workers";
import { logger } from "./utils/logger";
import { ENV } from "./config/environment";
import { CRON } from "./config/constants";
import { ProcessingStatus } from "./types/story";
import { StoryRepository } from "./storage/d1/story-repository";

// Extract minute intervals from cron patterns
function extractMinuteInterval(cronPattern: string): number {
  const minutePart = cronPattern.split(" ")[0];
  if (minutePart.startsWith("*/")) {
    return parseInt(minutePart.substring(2), 10);
  }
  return 0; // Default if pattern is not recognized
}

// Get intervals from constants
const INTERVALS = {
  FETCH_STORIES: extractMinuteInterval(CRON.FETCH_STORIES),
  PROCESS_CONTENT: extractMinuteInterval(CRON.PROCESS_CONTENT),
  GENERATE_SUMMARIES: extractMinuteInterval(CRON.GENERATE_SUMMARIES),
  SEND_NOTIFICATIONS: extractMinuteInterval(CRON.SEND_NOTIFICATIONS),
  DAILY_DIGEST: 1440, // Default to daily (1440 minutes)
};

// Worker names constants
const WORKERS = {
  STORY_FETCHER: "storyFetcher",
  CONTENT_PROCESSOR: "contentProcessor",
  SUMMARY_GENERATOR: "summaryGenerator",
  NOTIFICATION_SENDER: "notificationSender",
  DAILY_DIGEST: "dailyDigest",
};

// Initialize the router
const router = new Router();

// Register the worker handlers for manual invocation
router.add("GET", "/cron/fetch-stories", storyFetcherHandler);
router.add("GET", "/cron/process-content", contentProcessorHandler);
router.add("GET", "/cron/generate-summaries", summaryGeneratorHandler);
router.add("GET", "/cron/send-notifications", notificationSenderHandler);
router.add("GET", "/cron/daily-digest", dailyDigestHandler);

// Register API routes
router.add("GET", "/api/stories", storiesHandler);
router.add("GET", "/api/summaries", summariesHandler);
router.add("GET", "/api/workers", workersHandler);
router.add("POST", "/api/workers", workersHandler);

// Add test endpoint for cron jobs
router.add("GET", "/api/cron-test", async (request, env, ctx) => {
  logger.info("Cron test endpoint called");
  try {
    const storyRepo = new StoryRepository();
    await storyRepo.updateWorkerRunTime("cronTest");
    return new Response("Cron test successful", {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  } catch (error) {
    logger.error("Cron test failed", { error });
    return new Response(
      "Cron test failed: " + (error?.message || String(error)),
      {
        status: 500,
        headers: {
          "Content-Type": "text/plain",
        },
      },
    );
  }
});

// Define the fetch event handler for the worker
export default {
  async fetch(
    request: Request,
    env: ENV,
    ctx: ExecutionContext,
  ): Promise<Response> {
    // Initialize environment
    ENV.init(env);

    try {
      // Route the request
      return await router.handle(request, env, ctx);
    } catch (error) {
      logger.error("Unhandled exception", { error });
      return new Response("Internal Server Error", { status: 500 });
    }
  },

  // Schedule handler that orchestrates all workers
  async scheduled(
    event: ScheduledEvent,
    env: ENV,
    ctx: ExecutionContext,
  ): Promise<void> {
    // Initialize environment
    ENV.init(env);

    try {
      // Enhanced logging to debug environment variables
      logger.info("Scheduled event triggered", {
        cron: event.cron,
        envInitialized: !!env,
        hasDbBinding: !!env.HN_SUMMARIZER_DB,
        hasR2Binding: !!env.CONTENT_BUCKET,
        googleApiKey: !!env.GOOGLE_AI_API_KEY,
        firecrawlApiUrl: !!env.FIRECRAWL_API_URL,
        environment: env.ENVIRONMENT,
      });

      // Create a better dummy request for the handlers using the actual worker URL
      const dummyRequest = new Request(
        "https://hn-summarizer-production.rjiejin.workers.dev/internal-cron",
        {
          method: "GET",
          headers: {
            "X-Scheduled-Run": "true",
            "User-Agent": "CloudflareWorker/ScheduledEvent",
            Host: "hn-summarizer-production.rjiejin.workers.dev",
          },
        },
      );

      // Initialize repository for worker run times
      const storyRepo = new StoryRepository();

      // Validate database connection
      if (!storyRepo.db) {
        logger.error("Database binding is not available in scheduled event");
        return; // Exit early if database isn't available
      }

      // Track which workers ran
      const workersRun = [];

      // First, run a simple test to verify basic functionality
      try {
        logger.info("Running cron test");
        await storyRepo.updateWorkerRunTime("cronTest");
        logger.info("Cron test successfully updated timestamp");
      } catch (error) {
        logger.error("Cron test failed - database operation issue", { error });
      }

      // Check each worker against its interval using database tracking
      if (INTERVALS.FETCH_STORIES > 0) {
        try {
          const shouldRun = await storyRepo.shouldRunWorker(
            WORKERS.STORY_FETCHER,
            INTERVALS.FETCH_STORIES,
          );

          if (shouldRun) {
            logger.info("Running story fetcher");
            try {
              await storyFetcherHandler(dummyRequest, env, ctx);
              await storyRepo.updateWorkerRunTime(WORKERS.STORY_FETCHER);
              workersRun.push(WORKERS.STORY_FETCHER);
            } catch (error) {
              logger.error(`Error running ${WORKERS.STORY_FETCHER}`, { error });
            }
          } else {
            logger.debug(
              "Skipping story fetcher - not enough time elapsed since last run",
            );
          }
        } catch (error) {
          logger.error("Error checking if story fetcher should run", { error });
        }
      }

      if (INTERVALS.PROCESS_CONTENT > 0) {
        try {
          const shouldRun = await storyRepo.shouldRunWorker(
            WORKERS.CONTENT_PROCESSOR,
            INTERVALS.PROCESS_CONTENT,
          );

          if (shouldRun) {
            logger.info("Running content processor");
            try {
              await contentProcessorHandler(dummyRequest, env, ctx);
              await storyRepo.updateWorkerRunTime(WORKERS.CONTENT_PROCESSOR);
              workersRun.push(WORKERS.CONTENT_PROCESSOR);
            } catch (error) {
              logger.error(`Error running ${WORKERS.CONTENT_PROCESSOR}`, {
                error,
              });
            }
          } else {
            logger.debug(
              "Skipping content processor - not enough time elapsed since last run",
            );
          }
        } catch (error) {
          logger.error("Error checking if content processor should run", {
            error,
          });
        }
      }

      if (INTERVALS.GENERATE_SUMMARIES > 0) {
        try {
          const shouldRun = await storyRepo.shouldRunWorker(
            WORKERS.SUMMARY_GENERATOR,
            INTERVALS.GENERATE_SUMMARIES,
          );

          if (shouldRun) {
            logger.info("Running summary generator");
            try {
              await summaryGeneratorHandler(dummyRequest, env, ctx);
              await storyRepo.updateWorkerRunTime(WORKERS.SUMMARY_GENERATOR);
              workersRun.push(WORKERS.SUMMARY_GENERATOR);
            } catch (error) {
              logger.error(`Error running ${WORKERS.SUMMARY_GENERATOR}`, {
                error,
              });
            }
          } else {
            logger.debug(
              "Skipping summary generator - not enough time elapsed since last run",
            );
          }
        } catch (error) {
          logger.error("Error checking if summary generator should run", {
            error,
          });
        }
      }

      if (INTERVALS.SEND_NOTIFICATIONS > 0) {
        try {
          const shouldRun = await storyRepo.shouldRunWorker(
            WORKERS.NOTIFICATION_SENDER,
            INTERVALS.SEND_NOTIFICATIONS,
          );

          if (shouldRun) {
            logger.info("Running notification sender", {
              hasTelegramToken: !!env.TELEGRAM_BOT_TOKEN,
              hasTelegramChatId: !!env.TELEGRAM_CHAT_ID,
              hasDiscordWebhook: !!env.DISCORD_WEBHOOK_URL,
            });

            try {
              // Create a new dummy request with cron flag to help with debugging
              const notifRequest = new Request(
                "https://hn-summarizer-production.rjiejin.workers.dev/cron/send-notifications",
                {
                  method: "GET",
                  headers: {
                    "X-Scheduled-Run": "true",
                    "User-Agent": "CloudflareWorker/ScheduledEvent",
                    "X-Cron-Task": "notification-sender",
                    Host: "hn-summarizer-production.rjiejin.workers.dev",
                  },
                },
              );

              // Wrap in waitUntil to ensure completion
              const notifPromise = notificationSenderHandler(
                notifRequest,
                env,
                ctx,
              );
              ctx.waitUntil(notifPromise);

              // Also await directly to catch any immediate errors
              await notifPromise;

              await storyRepo.updateWorkerRunTime(WORKERS.NOTIFICATION_SENDER);
              workersRun.push(WORKERS.NOTIFICATION_SENDER);
            } catch (error) {
              logger.error(`Error running ${WORKERS.NOTIFICATION_SENDER}`, {
                error,
                errorType: error?.constructor?.name,
                errorMessage: error?.message,
                stack: error?.stack,
              });
            }
          } else {
            logger.debug(
              "Skipping notification sender - not enough time elapsed since last run",
            );
          }
        } catch (error) {
          logger.error("Error checking if notification sender should run", {
            error,
          });
        }
      }

      // Run daily digest worker
      if (INTERVALS.DAILY_DIGEST > 0) {
        try {
          const shouldRun = await storyRepo.shouldRunWorker(
            WORKERS.DAILY_DIGEST,
            INTERVALS.DAILY_DIGEST,
          );

          if (shouldRun) {
            logger.info("Running daily digest generator", {
              hasTelegramToken: !!env.TELEGRAM_BOT_TOKEN,
              hasTelegramChatId: !!env.TELEGRAM_CHAT_ID,
              hasDiscordWebhook: !!env.DISCORD_WEBHOOK_URL,
            });

            try {
              // Create a dummy request for the daily digest handler
              const digestRequest = new Request(
                "https://hn-summarizer-production.rjiejin.workers.dev/cron/daily-digest",
                {
                  method: "GET",
                  headers: {
                    "X-Scheduled-Run": "true",
                    "User-Agent": "CloudflareWorker/ScheduledEvent",
                    "X-Cron-Task": "daily-digest",
                    Host: "hn-summarizer-production.rjiejin.workers.dev",
                  },
                },
              );

              // Wrap in waitUntil to ensure completion
              const digestPromise = dailyDigestHandler(digestRequest, env, ctx);
              ctx.waitUntil(digestPromise);

              // Also await directly to catch any immediate errors
              await digestPromise;

              await storyRepo.updateWorkerRunTime(WORKERS.DAILY_DIGEST);
              workersRun.push(WORKERS.DAILY_DIGEST);
            } catch (error) {
              logger.error(`Error running ${WORKERS.DAILY_DIGEST}`, {
                error,
                errorType: error?.constructor?.name,
                errorMessage: error?.message,
                stack: error?.stack,
              });
            }
          } else {
            logger.debug(
              "Skipping daily digest - not enough time elapsed since last run",
            );
          }
        } catch (error) {
          logger.error("Error checking if daily digest should run", {
            error,
          });
        }
      }

      logger.info("Orchestration completed", {
        workersRun: workersRun.join(", ") || "none",
      });
    } catch (error) {
      logger.error("Error in scheduled job", { error, cron: event.cron });
    }
  },
};
