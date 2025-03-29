/**
 * Discord Notification Service
 *
 * This module provides functions for sending notifications to Discord.
 * It handles formatting summaries for Discord and sending messages
 * through Discord webhooks.
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
    return this.webhookUrl !== null;
  }

  async sendSummary(story: HNStory, summary: Summary): Promise<boolean> {
    if (!this.isConfigured()) {
      logger.warn("Discord notifier not properly configured");
      return false;
    }

    try {
      // Format a concise version of the summary that won't be cut off
      const conciseSummary = this.formatConciseSummary(summary.summary, 900);

      // Create a simpler payload without using Discord.js
      const payload = {
        embeds: [
          {
            title: `${story.title} | Score: ${story.score} ⭐`,
            url: story.url,
            description:
              summary.shortSummary ||
              this.formatConciseSummary(summary.summary, 300),
            color: 0x0099ff, // A nicer blue
            fields: [
              {
                name: "Summary",
                value: conciseSummary,
              },
              ...(summary.keyPoints && summary.keyPoints.length > 0
                ? [
                    {
                      name: "Key Points",
                      value: summary.keyPoints
                        .map((point) => `• ${point}`)
                        .join("\n")
                        .substring(0, 1024),
                    },
                  ]
                : []),
              {
                name: "Links",
                value: `[HN Discussion](https://news.ycombinator.com/item?id=${story.id})${
                  story.url ? ` | [Original Article](${story.url})` : ""
                }`,
              },
            ],
            footer: {
              text: `Posted by: ${story.by} | ${summary.estimatedReadingTime || "?"} min read | ${
                summary.topics ? summary.topics.join(", ") : "Tech"
              }`,
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

      // No ellipsis - we're ending at a complete sentence or word
    }

    return result.trim();
  }
}
