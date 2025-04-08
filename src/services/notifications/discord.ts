/**
 * Discord Notification Service
 *
 * This module provides functions for sending notifications to Discord.
 * It handles formatting summaries for Discord and sending messages
 * through Discord webhooks with an enhanced visual design.
 */

import { WebhookClient, EmbedBuilder, Colors } from "discord.js";
import { logger } from "../../utils/logger";
import { ENV } from "../../config/environment";
import { Summary } from "../../types/summary";
import { HNStory } from "../../types/hackernews";

/**
 * Discord notification service
 */
export class DiscordNotifier {
  private webhookUrl: string | null = null;

  constructor(webhookUrl?: string) {
    // Get webhook URL from environment if not provided
    this.webhookUrl = webhookUrl || ENV.get("DISCORD_WEBHOOK_URL");

    if (!this.webhookUrl) {
      logger.warn("Discord webhook URL not configured");
    }
  }

  isConfigured(): boolean {
    const isConfigured = this.webhookUrl !== null;

    if (!isConfigured) {
      logger.warn("Discord notifier not properly configured", {
        hasWebhookUrl: !!this.webhookUrl,
        hasWebhookUrlInEnv: !!ENV.get("DISCORD_WEBHOOK_URL"),
      });
    }

    return isConfigured;
  }

  async sendSummary(story: HNStory, summary: Summary): Promise<boolean> {
    if (!this.isConfigured()) {
      logger.warn("Discord notifier not properly configured");
      return false;
    }

    try {
      // Check if this is a daily digest (has ID 0)
      const isDailyDigest = story.id === 0;

      if (isDailyDigest) {
        return this.sendDailyDigest(story, summary);
      }

      // Regular summary logic for individual stories
      // Format a concise version of the summary that won't be cut off
      const conciseSummary = this.formatConciseSummary(summary.summary, 900);

      // Get emoji for score-based tier
      const scoreTierEmoji = this.getScoreTierEmoji(story.score);

      // Format topics without emojis
      const formattedTopics = this.formatTopics(summary.topics || ["Tech"]);

      // Format date in a compact way with PDT timezone
      const timestamp = new Date();
      const formattedDate = this.formatCompactDate(timestamp);

      // Create payload with improved design
      const payload = {
        embeds: [
          {
            title: `${scoreTierEmoji} ${story.title} | ${story.score} points`,
            url: story.url,
            description: this.formatDescription(story, summary),
            color: this.getColorByScore(story.score), // Dynamic color based on score
            fields: [
              {
                name: "📝 Summary",
                value: conciseSummary,
              },
              ...(summary.keyPoints && summary.keyPoints.length > 0
                ? [
                    {
                      name: "🔑 Key Points",
                      value: this.formatKeyPoints(summary.keyPoints),
                    },
                  ]
                : []),
              {
                name: "🏷️ Topics",
                value: formattedTopics,
                inline: true,
              },
              {
                name: "⏱️ Reading Time",
                value: `${summary.estimatedReadingTime || "?"} min read`,
                inline: true,
              },
              {
                name: "🔗 Links",
                value: this.formatLinks(story),
              },
            ],
            thumbnail: story.url
              ? {
                  // Use a favicon service to get website icon
                  url: `https://www.google.com/s2/favicons?domain=${new URL(story.url).hostname}&sz=128`,
                }
              : undefined,
            footer: {
              text: `Posted by ${story.by} | ${formattedDate} | Summarized by ${summary.model}`,
            },
            // Don't use Discord's automatic timestamp which shows as "Today at X"
            // timestamp: new Date().toISOString(),
          },
        ],
      };

      // Send to Discord webhook
      const response = await fetch(this.webhookUrl!, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        logger.warn("Discord webhook request failed", {
          status: response.status,
          statusText: response.statusText,
        });
        return false;
      }

      logger.info("Summary sent to Discord", { storyId: story.id });
      return true;
    } catch (error) {
      logger.error("Error sending summary to Discord", {
        error,
        storyId: story.id,
      });
      return false;
    }
  }

  /**
   * Send a daily digest to Discord
   * This handles the special case of sending a longer markdown text
   * by splitting it into multiple messages if necessary
   */
  private async sendDailyDigest(
    story: HNStory,
    summary: Summary,
  ): Promise<boolean> {
    try {
      // Split the digest content into chunks of 1800 characters (below Discord's 2000 limit)
      // but ensure we don't split in the middle of a line
      const chunks = this.chunkText(summary.summary, 1800);

      logger.info(`Sending daily digest to Discord in ${chunks.length} parts`);

      // Send each chunk as a separate message
      for (let i = 0; i < chunks.length; i++) {
        const payload = {
          content: chunks[i],
          // Only add the title for the first chunk
          ...(i === 0 && {
            username: "HackerNews Daily Digest",
            avatar_url: "https://news.ycombinator.com/favicon.ico",
          }),
        };

        // Send to Discord webhook
        const response = await fetch(this.webhookUrl!, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          logger.warn(`Failed to send digest part ${i + 1}/${chunks.length}`, {
            status: response.status,
            statusText: response.statusText,
          });
          return false;
        }

        // Add a small delay between messages to prevent rate limiting
        if (i < chunks.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      logger.info("Daily digest sent to Discord successfully");
      return true;
    } catch (error) {
      logger.error("Error sending daily digest to Discord", { error });
      return false;
    }
  }

  /**
   * Split text into chunks at natural break points
   */
  private chunkText(text: string, maxChunkSize: number): string[] {
    // If text is smaller than chunk size, return it as is
    if (text.length <= maxChunkSize) {
      return [text];
    }

    const chunks: string[] = [];
    let remainingText = text;

    while (remainingText.length > 0) {
      if (remainingText.length <= maxChunkSize) {
        chunks.push(remainingText);
        break;
      }

      // Find a good breaking point - preferably at double newlines
      let splitIndex = remainingText.lastIndexOf("\n\n", maxChunkSize);

      // If no double newline found, try a single newline
      if (splitIndex === -1 || splitIndex < maxChunkSize / 2) {
        splitIndex = remainingText.lastIndexOf("\n", maxChunkSize);
      }

      // If no newline found, try a space
      if (splitIndex === -1 || splitIndex < maxChunkSize / 2) {
        splitIndex = remainingText.lastIndexOf(" ", maxChunkSize);
      }

      // If all else fails, hard split at maxChunkSize
      if (splitIndex === -1 || splitIndex < maxChunkSize / 2) {
        splitIndex = maxChunkSize;
      }

      chunks.push(remainingText.substring(0, splitIndex).trim());
      remainingText = remainingText.substring(splitIndex).trim();
    }

    return chunks;
  }

  /**
   * Format a date in a compact format with PDT timezone
   * Example: "2025-04-07 15:30 PDT"
   */
  private formatCompactDate(date: Date): string {
    // Format date as YYYY-MM-DD
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    // Format time as HH:MM
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    // Use PDT as requested by the user
    return `${year}-${month}-${day} ${hours}:${minutes} PDT`;
  }

  /**
   * Format description with a more engaging layout
   */
  private formatDescription(story: HNStory, summary: Summary): string {
    const shortSummary =
      summary.shortSummary || this.formatConciseSummary(summary.summary, 300);

    // Add the short summary with a divider bar
    return `${shortSummary}\n\n` + `━━━━━━━━━━━━━━━━━━━━━━━━`;
  }

  /**
   * Format key points with styled bullets and improved spacing
   */
  private formatKeyPoints(keyPoints: string[]): string {
    if (!keyPoints || keyPoints.length === 0) {
      return "No key points provided.";
    }

    // Limit to 5 key points to prevent too long messages
    const limitedPoints = keyPoints.slice(0, 5);
    const formattedPoints = limitedPoints
      .map((point) => `• ${point.trim()}`)
      .join("\n\n");

    // Add "and more..." if we truncated the list
    const moreIndicator =
      keyPoints.length > 5 ? "\n\n_...and more points_" : "";

    return formattedPoints + moreIndicator;
  }

  /**
   * Format topics without emojis
   */
  private formatTopics(topics: string[]): string {
    // Limit to 5 topics max
    const limitedTopics = topics.slice(0, 5);

    return limitedTopics.join(", ");
  }

  /**
   * Format links section with nice formatting
   */
  private formatLinks(story: HNStory): string {
    const hnLink = `[📊 HN Discussion](https://news.ycombinator.com/item?id=${story.id})`;
    const articleLink = story.url ? `[📄 Original Article](${story.url})` : "";

    if (articleLink) {
      return `${hnLink} • ${articleLink}`;
    }
    return hnLink;
  }

  /**
   * Get an appropriate color based on the story score
   */
  private getColorByScore(score: number): number {
    if (score >= 500) return 0xff5700; // High score - reddit orange
    if (score >= 200) return 0xff9900; // Medium-high score - amber
    if (score >= 100) return 0x57ae09; // Medium score - green
    return 0x0099ff; // Default - blue
  }

  /**
   * Get emoji tier based on score
   */
  private getScoreTierEmoji(score: number): string {
    if (score >= 500) return "🏆"; // Trophy
    if (score >= 300) return "🥇"; // Gold
    if (score >= 200) return "🥈"; // Silver
    if (score >= 100) return "🥉"; // Bronze
    return "⭐"; // Default star
  }

  /**
   * Format a concise version of a summary to fit within Discord's limits
   * without cutting off mid-sentence
   *
   * @param text The text to format
   * @param maxLength Maximum character length
   * @returns Formatted text
   */
  private formatConciseSummary(text: string, maxLength: number): string {
    // If the text is already shorter than maxLength, return it as is
    if (text.length <= maxLength) {
      return text;
    }

    // Split the text into sentences
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];

    // Start with an empty result
    let result = "";

    // Add sentences until we're close to the limit
    for (const sentence of sentences) {
      if ((result + sentence).length <= maxLength - 10) {
        // Leave some buffer
        result += sentence;
      } else {
        break;
      }
    }

    // If we couldn't fit any complete sentences or the result is too short,
    // fall back to a clean truncation without ellipsis
    if (result.length < 100) {
      // Truncate at the last complete word
      result = text.substring(0, maxLength - 10);
      const lastSpace = result.lastIndexOf(" ");
      if (lastSpace > 0) {
        result = result.substring(0, lastSpace);
      }
    }

    return result.trim();
  }
}
