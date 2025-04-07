/**
 * Daily Digest Worker
 *
 * This worker generates a daily "magazine" or "newspaper" style summary
 * of all processed HackerNews stories from the past day.
 * It categorizes stories, formats them in a digest format, and can
 * be delivered through the notification channels.
 */

import { StoryRepository } from "../storage/d1/story-repository";
import { ContentRepository } from "../storage/r2/content-repository";
import { ProcessingStatus } from "../types/story";
import { Summary, SummaryFormat } from "../types/summary";
import { TelegramNotifier } from "../services/notifications/telegram";
import { DiscordNotifier } from "../services/notifications/discord";
import { GoogleAISummarizer } from "../services/summarization/google-ai";
import { logger } from "../utils/logger";
import { metrics, MetricType } from "../utils/metrics";
import { ENV } from "../config/environment";
import { PROCESSING } from "../config/constants";
import { HNStory } from "../types/hackernews";

/**
 * Configuration for digest generation
 */
interface DigestConfig {
  /** Maximum number of stories to include */
  maxStories: number;

  /** Minimum number of stories required to generate a digest */
  minStories: number;

  /** Grouping method (by topic, by date, etc.) */
  groupingMethod: "topic" | "date" | "score";

  /** Format for the digest */
  format: SummaryFormat;

  /** Whether to include story links */
  includeLinks: boolean;
}

/**
 * Story category with stories
 */
interface StoryCategory {
  /** Name of the category */
  name: string;

  /** Stories in this category */
  stories: {
    title: string;
    url: string | null;
    hnUrl: string;
    shortSummary?: string;
    topics?: string[];
    score: number;
  }[];
}

/**
 * Daily digest structure
 */
interface DailyDigest {
  /** Date of the digest */
  date: string;

  /** Introduction text */
  intro: string;

  /** Categories with stories */
  categories: StoryCategory[];

  /** Total number of stories */
  totalStories: number;
}

/**
 * Handler for the daily digest worker
 */
export async function dailyDigestHandler(
  request: Request,
  env: any,
  ctx: ExecutionContext,
): Promise<Response> {
  const storyRepo = new StoryRepository();
  const contentRepo = new ContentRepository();
  const telegramNotifier = new TelegramNotifier();
  const discordNotifier = new DiscordNotifier();

  // Get maximum number of stories to include in digest
  const maxStories = parseInt(ENV.get("DIGEST_MAX_STORIES") || "30", 10);

  // Get minimum number of stories required to generate digest
  const minStories = parseInt(ENV.get("DIGEST_MIN_STORIES") || "5", 10);

  // Get grouping method
  const groupingMethod =
    (ENV.get("DIGEST_GROUPING") as "topic" | "date" | "score") || "topic";

  // Get digest format
  const format =
    (ENV.get("DIGEST_FORMAT") as SummaryFormat) || SummaryFormat.MARKDOWN;

  // Whether to include links
  const includeLinks = ENV.get("DIGEST_INCLUDE_LINKS") !== "false";

  // Configuration for digest
  const config: DigestConfig = {
    maxStories,
    minStories,
    groupingMethod,
    format,
    includeLinks,
  };

  try {
    // Check if the worker should run based on its interval
    const shouldRun = await storyRepo.shouldRunWorker(
      "dailyDigest",
      PROCESSING.DIGEST_INTERVAL_MINUTES,
    );

    if (!shouldRun) {
      return new Response(
        JSON.stringify({
          status: "skipped",
          message: "Not enough time has passed since the last run",
        }),
        { status: 200 },
      );
    }

    // Get stories processed in the last 24 hours
    const stories = await storyRepo.getStoriesByMultipleStatuses(
      [ProcessingStatus.COMPLETED, ProcessingStatus.SENT],
      maxStories,
    );

    // Skip if not enough stories
    if (stories.length < minStories) {
      await storyRepo.updateWorkerRunTime("dailyDigest");
      return new Response(
        JSON.stringify({
          status: "skipped",
          message: `Not enough stories (${stories.length}/${minStories})`,
        }),
        { status: 200 },
      );
    }

    // Get summaries for all stories
    const summariesWithStories = await Promise.all(
      stories.map(async (story) => {
        if (!story.summaryId) {
          return null;
        }

        const summary = await contentRepo.getSummary(story.summaryId);
        if (!summary) {
          return null;
        }

        return { story, summary };
      }),
    );

    // Filter out null entries
    const validEntries = summariesWithStories.filter(
      (entry): entry is { story: (typeof stories)[0]; summary: Summary } =>
        entry !== null,
    );

    // Create a list of stories and summaries for the LLM
    const storiesToProcess = validEntries.map((entry) => entry.story);
    const summaries = validEntries.map((entry) => entry.summary);

    // Generate formatted date for the digest
    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Use Google AI to generate the digest
    const googleAI = new GoogleAISummarizer();

    logger.info(
      `Generating AI-powered digest from ${validEntries.length} stories`,
    );

    // Generate the digest using LLM
    const digestResult = await googleAI.generateDigest(
      storiesToProcess,
      summaries,
      today,
    );

    // Track token usage
    metrics.trackAPIUsage(
      digestResult.tokens.input,
      digestResult.tokens.output,
      digestResult.model,
    );

    // Use the generated content
    const formattedDigest = digestResult.content;

    // Send the digest via configured channels
    const results = {
      telegram: { sent: false, error: null as string | null },
      discord: { sent: false, error: null as string | null },
    };

    if (telegramNotifier.isConfigured()) {
      try {
        // Create a dummy story object for the notifier
        const dummyStory: HNStory = {
          id: 0,
          type: "story",
          by: "HackerNews Digest",
          time: Math.floor(Date.now() / 1000),
          title: `HackerNews Daily Digest - ${new Date().toLocaleDateString()}`,
          score: 0,
        };

        // Create a dummy summary object for the notifier
        const dummySummary: Summary = {
          storyId: 0,
          summary: formattedDigest,
          model: "digest",
          inputTokens: 0,
          outputTokens: 0,
          generatedAt: new Date().toISOString(),
        };

        const sent = await telegramNotifier.sendSummary(
          dummyStory,
          dummySummary,
        );
        results.telegram.sent = sent;
        if (sent) {
          metrics.increment(MetricType.NOTIFICATION_SENT);
        }
      } catch (error) {
        results.telegram.error = (error as Error).message;
        logger.error("Failed to send digest to Telegram", error);
      }
    }

    if (discordNotifier.isConfigured()) {
      try {
        // Create a dummy story object for the notifier
        const dummyStory: HNStory = {
          id: 0,
          type: "story",
          by: "HackerNews Digest",
          time: Math.floor(Date.now() / 1000),
          title: `HackerNews Daily Digest - ${new Date().toLocaleDateString()}`,
          score: 0,
        };

        // Create a dummy summary object for the notifier
        const dummySummary: Summary = {
          storyId: 0,
          summary: formattedDigest,
          model: "digest",
          inputTokens: 0,
          outputTokens: 0,
          generatedAt: new Date().toISOString(),
        };

        const sent = await discordNotifier.sendSummary(
          dummyStory,
          dummySummary,
        );
        results.discord.sent = sent;
        if (sent) {
          metrics.increment(MetricType.NOTIFICATION_SENT);
        }
      } catch (error) {
        results.discord.error = (error as Error).message;
        logger.error("Failed to send digest to Discord", error);
      }
    }

    // Update the last run time
    await storyRepo.updateWorkerRunTime("dailyDigest");

    return new Response(
      JSON.stringify({
        status: "success",
        stories: validEntries.length,
        results,
      }),
      { status: 200 },
    );
  } catch (error) {
    const errorMessage = (error as Error).message;
    logger.error("Error in daily digest worker", error);

    return new Response(
      JSON.stringify({
        status: "error",
        message: errorMessage,
      }),
      { status: 500 },
    );
  }
}

// Note: We no longer need manual digest creation and formatting functions
// since we're using LLM-based generation
