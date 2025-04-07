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

    // Create the digest
    const digest = createDigest(validEntries, config);

    // Format the digest
    const formattedDigest = formatDigest(digest, config);

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

/**
 * Create a daily digest from stories and summaries
 */
function createDigest(
  entries: { story: any; summary: Summary }[],
  config: DigestConfig,
): DailyDigest {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Extract all topics from summaries
  const allTopics = new Set<string>();
  entries.forEach(({ summary }) => {
    summary.topics?.forEach((topic) => allTopics.add(topic));
  });

  // Determine the primary topic for each story
  const storyTopics = entries.map(({ story, summary }) => {
    // Use topics from summary if available, or dynamically assign one
    const primaryTopic =
      summary.topics && summary.topics.length > 0
        ? summary.topics[0]
        : assignTopicByTitle(story.title);

    return {
      story,
      summary,
      primaryTopic,
    };
  });

  // Group stories by topic
  const categoriesMap = new Map<string, StoryCategory>();

  storyTopics.forEach(({ story, summary, primaryTopic }) => {
    if (!categoriesMap.has(primaryTopic)) {
      categoriesMap.set(primaryTopic, {
        name: primaryTopic,
        stories: [],
      });
    }

    const category = categoriesMap.get(primaryTopic)!;

    // Prepare story data for digest
    category.stories.push({
      title: story.title,
      url: story.url,
      hnUrl: `https://news.ycombinator.com/item?id=${story.id}`,
      shortSummary:
        summary.shortSummary || summary.summary.split(". ")[0] + ".",
      topics: summary.topics,
      score: story.score,
    });
  });

  // Convert map to array and sort categories by number of stories
  const categories = Array.from(categoriesMap.values())
    .filter((category) => category.stories.length > 0)
    .sort((a, b) => b.stories.length - a.stories.length);

  // Sort stories within categories by score
  categories.forEach((category) => {
    category.stories.sort((a, b) => b.score - a.score);
  });

  // Create the digest
  return {
    date: today,
    intro: `Today's digest features ${entries.length} top stories from HackerNews.`,
    categories,
    totalStories: entries.length,
  };
}

/**
 * Format the digest based on the specified format
 */
function formatDigest(digest: DailyDigest, config: DigestConfig): string {
  // Format differs based on the desired output format
  switch (config.format) {
    case SummaryFormat.MARKDOWN:
      return formatMarkdownDigest(digest, config);
    case SummaryFormat.HTML:
      return formatHtmlDigest(digest, config);
    case SummaryFormat.TEXT:
    default:
      return formatTextDigest(digest, config);
  }
}

/**
 * Format the digest as markdown
 */
function formatMarkdownDigest(
  digest: DailyDigest,
  config: DigestConfig,
): string {
  let markdown = `# HackerNews Daily Digest - ${digest.date}\n\n`;

  // Add intro
  markdown += `${digest.intro}\n\n`;

  // Add categories and stories
  digest.categories.forEach((category) => {
    markdown += `## ${category.name}\n\n`;

    category.stories.forEach((story) => {
      // Story title with link (if configured)
      if (config.includeLinks && story.url) {
        markdown += `### [${story.title}](${story.url})\n`;
      } else {
        markdown += `### ${story.title}\n`;
      }

      // Short summary
      if (story.shortSummary) {
        markdown += `${story.shortSummary}\n`;
      }

      // HackerNews link
      markdown += `[Discuss on HackerNews](${story.hnUrl})\n\n`;
    });
  });

  return markdown;
}

/**
 * Format the digest as HTML
 */
function formatHtmlDigest(digest: DailyDigest, config: DigestConfig): string {
  let html = `<h1>HackerNews Daily Digest - ${digest.date}</h1>`;

  // Add intro
  html += `<p>${digest.intro}</p>`;

  // Add categories and stories
  digest.categories.forEach((category) => {
    html += `<h2>${category.name}</h2>`;

    category.stories.forEach((story) => {
      // Story title with link (if configured)
      if (config.includeLinks && story.url) {
        html += `<h3><a href="${story.url}">${story.title}</a></h3>`;
      } else {
        html += `<h3>${story.title}</h3>`;
      }

      // Short summary
      if (story.shortSummary) {
        html += `<p>${story.shortSummary}</p>`;
      }

      // HackerNews link
      html += `<p><a href="${story.hnUrl}">Discuss on HackerNews</a></p>`;
    });
  });

  return html;
}

/**
 * Format the digest as plain text
 */
function formatTextDigest(digest: DailyDigest, config: DigestConfig): string {
  let text = `HackerNews Daily Digest - ${digest.date}\n\n`;

  // Add intro
  text += `${digest.intro}\n\n`;

  // Add categories and stories
  digest.categories.forEach((category) => {
    text += `== ${category.name} ==\n\n`;

    category.stories.forEach((story) => {
      // Story title
      text += `${story.title}\n`;

      // URL (if configured)
      if (config.includeLinks && story.url) {
        text += `${story.url}\n`;
      }

      // Short summary
      if (story.shortSummary) {
        text += `${story.shortSummary}\n`;
      }

      // HackerNews link
      text += `Discuss: ${story.hnUrl}\n\n`;
    });
  });

  return text;
}

/**
 * Assign a topic to a story based on its title
 * This is a fallback when no explicit topics are available
 */
function assignTopicByTitle(title: string): string {
  const titleLower = title.toLowerCase();

  // Common tech topics to check for
  const topicPatterns = [
    {
      pattern: /\b(ai|artificial intelligence|machine learning|ml|llm|gpt)\b/i,
      topic: "AI & Machine Learning",
    },
    {
      pattern: /\b(web|html|css|javascript|js|frontend|backend)\b/i,
      topic: "Web Development",
    },
    {
      pattern: /\b(blockchain|crypto|bitcoin|ethereum|nft)\b/i,
      topic: "Blockchain & Crypto",
    },
    {
      pattern: /\b(security|privacy|hack|exploit|vulnerability)\b/i,
      topic: "Security & Privacy",
    },
    {
      pattern: /\b(startup|funding|vc|venture)\b/i,
      topic: "Startups & Business",
    },
    { pattern: /\b(mobile|android|ios|app)\b/i, topic: "Mobile" },
    {
      pattern: /\b(cloud|aws|azure|gcp|serverless)\b/i,
      topic: "Cloud & Infrastructure",
    },
    {
      pattern: /\b(data|analytics|sql|nosql|database)\b/i,
      topic: "Data & Analytics",
    },
    {
      pattern: /\b(python|java|go|rust|c\+\+|typescript)\b/i,
      topic: "Programming Languages",
    },
    { pattern: /\b(ui|ux|design|user|interface)\b/i, topic: "Design & UI/UX" },
    { pattern: /\b(game|gaming|unity|unreal)\b/i, topic: "Gaming" },
    {
      pattern: /\b(science|physics|biology|chemistry|math)\b/i,
      topic: "Science",
    },
  ];

  // Check for pattern matches
  for (const { pattern, topic } of topicPatterns) {
    if (pattern.test(titleLower)) {
      return topic;
    }
  }

  // Default topic if no pattern matches
  return "Technology";
}
