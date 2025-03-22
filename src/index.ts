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
};

// Worker names constants
const WORKERS = {
  STORY_FETCHER: "storyFetcher",
  CONTENT_PROCESSOR: "contentProcessor",
  SUMMARY_GENERATOR: "summaryGenerator",
  NOTIFICATION_SENDER: "notificationSender",
};

// Initialize the router
const router = new Router();

// Register the worker handlers for manual invocation
router.add("GET", "/cron/fetch-stories", storyFetcherHandler);
router.add("GET", "/cron/process-content", contentProcessorHandler);
router.add("GET", "/cron/generate-summaries", summaryGeneratorHandler);
router.add("GET", "/cron/send-notifications", notificationSenderHandler);

// Register API routes
router.add("GET", "/api/stories", storiesHandler);
router.add("GET", "/api/summaries", summariesHandler);
router.add("GET", "/api/workers", workersHandler);
router.add("POST", "/api/workers", workersHandler);

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
      logger.info("Scheduled event triggered", { cron: event.cron });

      // Create a dummy request for the handlers
      const dummyRequest = new Request("https://dummy.com", { method: "GET" });

      // Initialize repository for worker run times
      const storyRepo = new StoryRepository();

      // Track which workers ran
      const workersRun = [];

      // Check each worker against its interval using database tracking
      if (INTERVALS.FETCH_STORIES > 0) {
        const shouldRun = await storyRepo.shouldRunWorker(
          WORKERS.STORY_FETCHER,
          INTERVALS.FETCH_STORIES,
        );

        if (shouldRun) {
          logger.info("Running story fetcher");
          await storyFetcherHandler(dummyRequest, env, ctx);
          await storyRepo.updateWorkerRunTime(WORKERS.STORY_FETCHER);
          workersRun.push(WORKERS.STORY_FETCHER);
        } else {
          logger.debug(
            "Skipping story fetcher - not enough time elapsed since last run",
          );
        }
      }

      if (INTERVALS.PROCESS_CONTENT > 0) {
        const shouldRun = await storyRepo.shouldRunWorker(
          WORKERS.CONTENT_PROCESSOR,
          INTERVALS.PROCESS_CONTENT,
        );

        if (shouldRun) {
          logger.info("Running content processor");
          await contentProcessorHandler(dummyRequest, env, ctx);
          await storyRepo.updateWorkerRunTime(WORKERS.CONTENT_PROCESSOR);
          workersRun.push(WORKERS.CONTENT_PROCESSOR);
        } else {
          logger.debug(
            "Skipping content processor - not enough time elapsed since last run",
          );
        }
      }

      if (INTERVALS.GENERATE_SUMMARIES > 0) {
        const shouldRun = await storyRepo.shouldRunWorker(
          WORKERS.SUMMARY_GENERATOR,
          INTERVALS.GENERATE_SUMMARIES,
        );

        if (shouldRun) {
          logger.info("Running summary generator");
          await summaryGeneratorHandler(dummyRequest, env, ctx);
          await storyRepo.updateWorkerRunTime(WORKERS.SUMMARY_GENERATOR);
          workersRun.push(WORKERS.SUMMARY_GENERATOR);
        } else {
          logger.debug(
            "Skipping summary generator - not enough time elapsed since last run",
          );
        }
      }

      if (INTERVALS.SEND_NOTIFICATIONS > 0) {
        const shouldRun = await storyRepo.shouldRunWorker(
          WORKERS.NOTIFICATION_SENDER,
          INTERVALS.SEND_NOTIFICATIONS,
        );

        if (shouldRun) {
          logger.info("Running notification sender");
          await notificationSenderHandler(dummyRequest, env, ctx);
          await storyRepo.updateWorkerRunTime(WORKERS.NOTIFICATION_SENDER);
          workersRun.push(WORKERS.NOTIFICATION_SENDER);
        } else {
          logger.debug(
            "Skipping notification sender - not enough time elapsed since last run",
          );
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
