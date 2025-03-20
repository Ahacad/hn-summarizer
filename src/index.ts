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
import { logger } from "./utils/logger";
import { ENV } from "./config/environment";
import { CRON } from "./config/constants";

// Extract minute intervals from cron patterns
function extractMinuteInterval(cronPattern: string): number {
  const minutePart = cronPattern.split(' ')[0];
  if (minutePart.startsWith('*/')) {
    return parseInt(minutePart.substring(2), 10);
  }
  return 0; // Default if pattern is not recognized
}

// Get intervals from constants
const INTERVALS = {
  FETCH_STORIES: extractMinuteInterval(CRON.FETCH_STORIES),
  PROCESS_CONTENT: extractMinuteInterval(CRON.PROCESS_CONTENT),
  GENERATE_SUMMARIES: extractMinuteInterval(CRON.GENERATE_SUMMARIES),
  SEND_NOTIFICATIONS: extractMinuteInterval(CRON.SEND_NOTIFICATIONS)
};

// Initialize the router
const router = new Router();

// Register the worker handlers for manual invocation
router.add("GET", "/cron/fetch-stories", storyFetcherHandler);
router.add("GET", "/cron/process-content", contentProcessorHandler);
router.add("GET", "/cron/generate-summaries", summaryGeneratorHandler);
router.add("GET", "/cron/send-notifications", notificationSenderHandler);

// For future web interface
router.add("GET", "/api/stories", async (request, env) => {
  return new Response("Stories API - Coming soon", { status: 200 });
});

router.add("GET", "/api/summaries", async (request, env) => {
  return new Response("Summaries API - Coming soon", { status: 200 });
});

// Define the fetch event handler for the worker
export default {
  async fetch(
    request: Request,
    env: ENV,
    ctx: ExecutionContext
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
    ctx: ExecutionContext
  ): Promise<void> {
    // Initialize environment
    ENV.init(env);

    try {
      logger.info("Scheduled event triggered", { cron: event.cron });
      
      const now = new Date();
      const minute = now.getMinutes();
      
      // Create a dummy request for the handlers
      const url = new URL("https://dummy.com");
      const dummyRequest = new Request(url.toString(), { method: "GET" });
      
      // Track which workers ran
      const workersRun = [];
      
      // Check each worker against its interval
      if (INTERVALS.FETCH_STORIES > 0 && minute % INTERVALS.FETCH_STORIES === 0) {
        logger.info("Running story fetcher");
        await storyFetcherHandler(dummyRequest, env, ctx);
        workersRun.push("storyFetcher");
      }
      
      if (INTERVALS.PROCESS_CONTENT > 0 && minute % INTERVALS.PROCESS_CONTENT === 0) {
        logger.info("Running content processor");
        await contentProcessorHandler(dummyRequest, env, ctx);
        workersRun.push("contentProcessor");
      }
      
      if (INTERVALS.GENERATE_SUMMARIES > 0 && minute % INTERVALS.GENERATE_SUMMARIES === 0) {
        logger.info("Running summary generator");
        await summaryGeneratorHandler(dummyRequest, env, ctx);
        workersRun.push("summaryGenerator");
      }
      
      if (INTERVALS.SEND_NOTIFICATIONS > 0 && minute % INTERVALS.SEND_NOTIFICATIONS === 0) {
        logger.info("Running notification sender");
        await notificationSenderHandler(dummyRequest, env, ctx);
        workersRun.push("notificationSender");
      }
      
      logger.info("Orchestration completed", { 
        minute, 
        workersRun: workersRun.join(', ') || 'none'
      });
    } catch (error) {
      logger.error("Error in scheduled job", { error, cron: event.cron });
    }
  },
};
