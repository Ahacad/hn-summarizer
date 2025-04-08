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
// We'll use direct API calls instead of the telegra.ph package

/**
 * Helper function to check if this is a direct access via curl
 *
 * @param request The incoming request
 * @returns Whether the request appears to be a direct curl request
 */
function isDirectCurlAccess(request: Request): boolean {
  return (
    request.headers.get("user-agent")?.toLowerCase().includes("curl") ||
    request.headers.get("X-Direct-Access") === "true"
  );
}
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
 * The base URL for Telegraph API
 */
const TELEGRAPH_API_BASE = "https://api.telegra.ph";

/**
 * Create a Telegraph account
 *
 * @param shortName Short name of the account
 * @param authorName Name of the author
 * @returns Access token for the created account
 */
async function createTelegraphAccount(
  shortName: string = "HackerNewsDigest",
  authorName: string = "HackerNews Digest",
): Promise<string> {
  try {
    const response = await fetch(`${TELEGRAPH_API_BASE}/createAccount`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        short_name: shortName,
        author_name: authorName,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(`Failed to create Telegraph account: ${data.error}`);
    }

    logger.info("Created new Telegraph account");
    return data.result.access_token;
  } catch (error) {
    logger.error("Error creating Telegraph account", { error });
    throw error;
  }
}

/**
 * Convert markdown to Telegraph node structure
 *
 * @param markdown The markdown content to convert
 * @returns Content formatted as Telegraph nodes
 */
function formatContentForTelegraph(markdown: string): any[] {
  // First, look for any code blocks with triple backticks and handle them specifically
  const cleanedMarkdown = markdown.replace(
    /```[\w]*\s*([\s\S]*?)```/g,
    (match, codeContent) => {
      // Replace code blocks with a special marker that won't be affected by the paragraph split
      return `CODE_BLOCK_MARKER${codeContent.trim()}CODE_BLOCK_MARKER`;
    },
  );

  // Split content by double newlines to separate paragraphs
  const paragraphs = cleanedMarkdown.split(/\n\n+/);

  // Process each paragraph into a Telegraph node
  return paragraphs
    .map((paragraph) => {
      // Skip empty paragraphs
      if (!paragraph.trim()) {
        return null;
      }

      // Check if it's our marked code block
      if (paragraph.includes("CODE_BLOCK_MARKER")) {
        const code = paragraph.replace(
          /CODE_BLOCK_MARKER(.*)CODE_BLOCK_MARKER/s,
          "$1",
        );
        return {
          tag: "pre",
          children: [code],
        };
      }

      // Check if it's a heading with # symbols
      const headingMatch = paragraph.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length; // Number of # symbols
        const text = headingMatch[2].trim();

        // Telegraph supports h3 and h4 tags
        if (level <= 2) {
          return { tag: "h3", children: [text] };
        } else {
          return { tag: "h4", children: [text] };
        }
      }

      // Check if it's a title with double underscores, possibly with a score
      // First, check the exact format from the prompt template: __[Story Title]__
      const titleMatch = paragraph.match(/^__([^_]+)__$/);
      if (titleMatch) {
        // Extract the title text
        const titleText = titleMatch[1].trim();

        // Check if title contains a score in parentheses
        const scoreMatch = titleText.match(/(.+?)\s*\(Score:\s*(\d+)\)$/);

        if (scoreMatch) {
          // If there's a score, format the title with the score slightly smaller
          const actualTitle = scoreMatch[1].trim();
          const score = scoreMatch[2];

          return {
            tag: "h4",
            children: [
              actualTitle,
              " ",
              {
                tag: "span",
                attrs: { style: "font-size: 0.8em; color: #666;" },
                children: [`(Score: ${score})`],
              },
            ],
          };
        } else {
          // Regular title without score
          return { tag: "h4", children: [titleText] };
        }
      }

      // Check for bold text using double underscores that might be inline
      const inlineBoldMatch = paragraph.match(/__([^_]+)__/);
      if (inlineBoldMatch) {
        // Process the paragraph with our updated bold/italic handler
        return { tag: "p", children: processBoldAndItalic(paragraph) };
      }

      // Check for alternate possible title formats that might be generated
      // These could be titles without the double underscore format
      const altTitleScoreMatch = paragraph.match(
        /^([^(]+)\s*\(Score:\s*(\d+)\)$/,
      );
      if (altTitleScoreMatch) {
        const actualTitle = altTitleScoreMatch[1].trim();
        const score = altTitleScoreMatch[2];

        return {
          tag: "h4",
          children: [
            actualTitle,
            " ",
            {
              tag: "span",
              attrs: { style: "font-size: 0.8em; color: #666;" },
              children: [`(Score: ${score})`],
            },
          ],
        };
      }

      // Check if it's a code block with triple backticks
      const codeBlockMatch = paragraph.match(
        /^```([\w]*)\s*\n([\s\S]*)\n```\s*$/,
      );
      if (codeBlockMatch) {
        const language = codeBlockMatch[1]; // Optional language specifier
        const code = codeBlockMatch[2].trim();

        // For Telegraph, we'll use pre tags for code blocks
        return {
          tag: "pre",
          children: [code],
        };
      }

      // Check if it's a list
      if (
        paragraph.trim().startsWith("- ") ||
        paragraph.trim().startsWith("* ")
      ) {
        // Split into list items
        const items = paragraph
          .split(/\n- |\n\* /)
          .map((item) => item.replace(/^- |^\* /, "").trim())
          .filter(Boolean);

        // Create list items
        const listItems = items.map((item) => {
          return {
            tag: "li",
            children: [item],
          };
        });

        return {
          tag: "ul",
          children: listItems,
        };
      }

      // First, check if paragraph starts with "**" and ends with "**" - likely a section header
      if (paragraph.startsWith("**") && paragraph.endsWith("**")) {
        const headerText = paragraph.substring(2, paragraph.length - 2).trim();
        return { tag: "h3", children: [headerText] };
      }

      // Process links [text](url)
      let processedPara = paragraph;
      let linkMatches = [];
      const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
      let match;

      // Find all links
      while ((match = linkRegex.exec(paragraph)) !== null) {
        linkMatches.push({
          fullMatch: match[0],
          text: match[1],
          url: match[2],
          index: match.index,
        });
      }

      // If there are links, we need to split the paragraph
      if (linkMatches.length > 0) {
        const fragments = [];
        let lastIndex = 0;

        for (const link of linkMatches) {
          // Add text before the link
          if (link.index > lastIndex) {
            const beforeText = paragraph.substring(lastIndex, link.index);
            // Check if this fragment has bold formatting
            if (beforeText.includes("__")) {
              const processed = processBoldAndItalic(beforeText);
              if (Array.isArray(processed)) {
                fragments.push(...processed);
              } else {
                fragments.push(processed);
              }
            } else {
              fragments.push(beforeText);
            }
          }

          // Add the link
          fragments.push({
            tag: "a",
            attrs: { href: link.url },
            children: [link.text],
          });

          lastIndex = link.index + link.fullMatch.length;
        }

        // Add remaining text
        if (lastIndex < paragraph.length) {
          const afterText = paragraph.substring(lastIndex);
          // Check if this fragment has bold formatting
          if (afterText.includes("__")) {
            const processed = processBoldAndItalic(afterText);
            if (Array.isArray(processed)) {
              fragments.push(...processed);
            } else {
              fragments.push(processed);
            }
          } else {
            fragments.push(afterText);
          }
        }

        return { tag: "p", children: fragments };
      }

      // Check for bold and italic
      processedPara = processBoldAndItalic(paragraph);

      // Regular paragraph
      if (typeof processedPara === "string") {
        return { tag: "p", children: [processedPara] };
      } else {
        return { tag: "p", children: processedPara };
      }
    })
    .filter(Boolean); // Remove null nodes
}

/**
 * Process bold and italic formatting
 *
 * @param text Text to process
 * @returns Processed text or array of nodes
 */
function processBoldAndItalic(text: string): string | any[] {
  // Check for bold (**text** or __text__)
  const boldRegex = /\*\*([^*]+)\*\*|__([^_]+)__/g;
  const italicRegex = /\*([^*]+)\*/g;

  // If no formatting, return as is
  if (!boldRegex.test(text) && !italicRegex.test(text)) {
    return text;
  }

  // Handle bold text
  const fragments = [];
  let lastIndex = 0;
  let match;

  // Reset regex
  boldRegex.lastIndex = 0;

  // Process bold (both ** and __)
  while ((match = boldRegex.exec(text)) !== null) {
    // Add text before the bold part
    if (match.index > lastIndex) {
      fragments.push(text.substring(lastIndex, match.index));
    }

    // Get the content of the bold section
    const boldContent = match[1] || match[2]; // match[1] for ** format, match[2] for __ format

    // Check if the bold content contains a score
    const scoreMatch = boldContent.match(/(.+?)\s*\(Score:\s*(\d+)\)$/);

    if (scoreMatch) {
      // If there's a score, format it with the score slightly smaller
      const actualTitle = scoreMatch[1].trim();
      const score = scoreMatch[2];

      // For story titles, use h4 tag instead of b tag when they're in double underscore format
      if (match[0].startsWith("__")) {
        fragments.push({
          tag: "h4",
          children: [
            actualTitle,
            " ",
            {
              tag: "span",
              attrs: { style: "font-size: 0.8em; color: #666;" },
              children: [`(Score: ${score})`],
            },
          ],
        });
      } else {
        // Regular bold text with score
        fragments.push({
          tag: "b",
          children: [
            actualTitle,
            " ",
            {
              tag: "span",
              attrs: { style: "font-size: 0.8em; color: #666;" },
              children: [`(Score: ${score})`],
            },
          ],
        });
      }
    } else {
      // For story titles, use h4 tag instead of b tag when they're in double underscore format
      if (match[0].startsWith("__")) {
        fragments.push({
          tag: "h4",
          children: [boldContent],
        });
      } else {
        // Regular bold text without score
        fragments.push({
          tag: "b",
          children: [boldContent],
        });
      }
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    fragments.push(text.substring(lastIndex));
  }

  return fragments;
}

/**
 * Create a page on Telegraph
 *
 * @param accessToken Telegraph access token
 * @param title Title of the page
 * @param content Content in Telegraph format
 * @param authorName Name of the author
 * @returns URL of the created page
 */
async function createTelegraphPage(
  accessToken: string,
  title: string,
  content: string,
  authorName: string = "HackerNews Digest",
): Promise<string> {
  try {
    // Clean up any remaining backtick code blocks at the beginning of the content
    // This acts as a failsafe in case the AI-generated content still has code blocks
    const cleanedContent = content.replace(/^\s*```[\w]*[\s\S]*?```\s*/m, "");

    const contentNodes = formatContentForTelegraph(cleanedContent);

    const response = await fetch(`${TELEGRAPH_API_BASE}/createPage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        access_token: accessToken,
        title: title,
        content: contentNodes,
        author_name: authorName,
        return_content: false,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(`Failed to create Telegraph page: ${data.error}`);
    }

    logger.info("Created Telegraph page", { url: data.result.url });
    return data.result.url;
  } catch (error) {
    logger.error("Error creating Telegraph page", { error });
    throw error;
  }
}

/**
 * Publish content to Telegraph and get the URL
 *
 * @param title Title of the Telegraph page
 * @param content Content to publish
 * @param authorName Name of the author
 * @returns URL of the created Telegraph page
 */
async function publishToTelegraph(
  title: string,
  content: string,
  authorName: string = "HackerNews Digest",
): Promise<string> {
  try {
    // Use the stored access token from environment variables
    let accessToken = ENV.get("TELEGRAPH_ACCESS_TOKEN");

    // If no token is found, create a new account (fallback option)
    if (!accessToken) {
      logger.warn(
        "TELEGRAPH_ACCESS_TOKEN not found in environment, creating a temporary account",
      );
      accessToken = await createTelegraphAccount(
        "HackerNewsDigest",
        authorName,
      );
    } else {
      logger.info("Using existing Telegraph access token");
    }

    // Create the page
    const url = await createTelegraphPage(
      accessToken,
      title,
      content,
      authorName,
    );

    return url;
  } catch (error) {
    // If the token is invalid or expired, try to create a new account
    if (error.message?.includes("ACCESS_TOKEN_INVALID")) {
      logger.warn("Telegraph access token invalid, creating a new account");
      try {
        const newAccessToken = await createTelegraphAccount(
          "HackerNewsDigest",
          authorName,
        );
        const url = await createTelegraphPage(
          newAccessToken,
          title,
          content,
          authorName,
        );
        logger.info(
          "Consider updating your TELEGRAPH_ACCESS_TOKEN environment variable",
        );
        return url;
      } catch (retryError) {
        logger.error(
          "Error creating new Telegraph account after token failure",
          { retryError },
        );
        throw retryError;
      }
    }

    logger.error("Error publishing to Telegraph", { error });
    throw error;
  }
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
    // Check if this is a direct curl request using the helper
    const isDirectAccess = isDirectCurlAccess(request);

    // Only check the last run time if this is NOT a direct access
    if (!isDirectAccess) {
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
    } else {
      logger.info("Direct access detected, skipping last run time check");
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
          directAccess: isDirectCurlAccess(request),
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
      discord: {
        sent: false,
        error: null as string | null,
        telegraphUrl: null as string | null,
      },
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
        // Add a header message specifically for Discord formatting
        const discordPrefix = "**HACKERNEWS DAILY DIGEST**\n\n";

        const dummySummary: Summary = {
          storyId: 0,
          summary: discordPrefix + formattedDigest,
          model: "digest",
          inputTokens: digestResult.tokens.input,
          outputTokens: digestResult.tokens.output,
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
        // Format the date for the title
        const dateString = new Date().toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });

        const title = `HackerNews Daily Digest - ${dateString}`;

        // Publish the digest to Telegraph
        const telegraphUrl = await publishToTelegraph(
          title,
          formattedDigest,
          "HackerNews Summarizer",
        );

        // Create a dummy story object for the notifier
        const dummyStory: HNStory = {
          id: 0,
          type: "story",
          by: "HackerNews Digest",
          time: Math.floor(Date.now() / 1000),
          title: title,
          score: 0,
        };

        // Create a dummy summary object with the Telegraph link
        const discordSummary: Summary = {
          storyId: 0,
          summary: `📰 **HackerNews Daily Digest is ready!**\n\nRead today's tech news digest here: ${telegraphUrl}\n\n_Powered by AI - Includes ${validEntries.length} top stories with HackerNews scores_`,
          model: digestResult.model,
          inputTokens: digestResult.tokens.input,
          outputTokens: digestResult.tokens.output,
          generatedAt: new Date().toISOString(),
        };

        const sent = await discordNotifier.sendSummary(
          dummyStory,
          discordSummary,
        );

        // Add the Telegraph URL to the results
        results.discord = {
          sent: sent,
          error: null as string | null,
          telegraphUrl: telegraphUrl,
        };

        if (sent) {
          metrics.increment(MetricType.NOTIFICATION_SENT);
        }
      } catch (error) {
        results.discord = {
          sent: false,
          error: (error as Error).message,
          telegraphUrl: null,
        };
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
        directAccess: isDirectCurlAccess(request),
        telegraphUrl: results.discord.telegraphUrl || null,
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
        directAccess: isDirectCurlAccess(request),
      }),
      { status: 500 },
    );
  }
}

// Note: We no longer need manual digest creation and formatting functions
// since we're using LLM-based generation
