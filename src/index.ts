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

// Initialize the router
const router = new Router();

// Register the worker handlers for cron triggers
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

  // Schedule handlers
  async scheduled(
    event: ScheduledEvent,
    env: ENV,
    ctx: ExecutionContext,
  ): Promise<void> {
    // Initialize environment
    ENV.init(env);

    try {
      logger.info("Scheduled event triggered", { cron: event.cron });

      // Create a dummy request to route to the appropriate handler
      const url = new URL("https://dummy.com");

      // Route based on the cron pattern
      switch (event.cron) {
        case CRON.FETCH_STORIES: // Every 30 minutes
          url.pathname = "/cron/fetch-stories";
          break;
        case CRON.PROCESS_CONTENT: // Every 15 minutes
          url.pathname = "/cron/process-content";
          break;
        case CRON.GENERATE_SUMMARIES: // Every 10 minutes
          url.pathname = "/cron/generate-summaries";
          break;
        case CRON.SEND_NOTIFICATIONS: // Every 5 minutes
          url.pathname = "/cron/send-notifications";
          break;
        default:
          logger.warn("Unknown cron pattern", { cron: event.cron });
          return;
      }

      const request = new Request(url.toString(), { method: "GET" });
      await router.handle(request, env, ctx);
    } catch (error) {
      logger.error("Error in scheduled job", { error, cron: event.cron });
    }
  },
};
