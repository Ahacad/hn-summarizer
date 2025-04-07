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
      // Format a concise version of the summary that won't be cut off
      const conciseSummary = this.formatConciseSummary(summary.summary, 900);

      // Get emoji for score-based tier
      const scoreTierEmoji = this.getScoreTierEmoji(story.score);

      // Format topics without emojis
      const formattedTopics = this.formatTopics(summary.topics || ["Tech"]);

      // Calculate reading time emoji
      const readingTimeEmoji = this.getReadingTimeEmoji(
        summary.estimatedReadingTime || 5,
      );

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
                value: `${readingTimeEmoji} ${summary.estimatedReadingTime || "?"} min read`,
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
              text: `Posted by ${story.by} | HackerNews`,
            },
            timestamp: new Date().toISOString(),
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
   * Get reading time emoji based on length
   */
  private getReadingTimeEmoji(minutes: number): string {
    if (minutes >= 15) return "📚"; // Long read
    if (minutes >= 8) return "📖"; // Medium read
    return "📄"; // Short read
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
