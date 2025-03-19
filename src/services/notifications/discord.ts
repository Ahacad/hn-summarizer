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
// In src/services/notifications/discord.ts
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
      // Create a simpler payload without using Discord.js
      const payload = {
        embeds: [{
          title: story.title,
          url: story.url,
          description: summary.shortSummary || summary.summary.substring(0, 300),
          color: 0x0000FF, // Blue
          fields: [
            {
              name: "Summary",
              value: this.truncateText(summary.summary, 1024)
            },
            ...(summary.keyPoints ? [{
              name: "Key Points",
              value: summary.keyPoints.map(point => `• ${point}`).join('\n').substring(0, 1024)
            }] : []),
            ...(summary.topics ? [{
              name: "Topics",
              value: summary.topics.join(", "),
              inline: true
            }] : []),
            ...(summary.estimatedReadingTime ? [{
              name: "Reading Time",
              value: `${summary.estimatedReadingTime} min`,
              inline: true
            }] : []),
            {
              name: "HackerNews",
              value: `[Discussion](https://news.ycombinator.com/item?id=${story.id})`,
              inline: true
            }
          ],
          footer: {
            text: `Score: ${story.score} | By: ${story.by} | Summarized by HN Summarizer`
          },
          timestamp: new Date().toISOString()
        }]
      };

      // Send to Discord webhook
      const response = await fetch(this.webhookUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        logger.warn("Discord webhook request failed", { 
          status: response.status,
          statusText: response.statusText
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

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    // Truncate at the last space before maxLength
    const truncated = text.substring(0, maxLength - 3);
    const lastSpace = truncated.lastIndexOf(" ");

    if (lastSpace > 0) {
      return truncated.substring(0, lastSpace) + "...";
    }

    return truncated + "...";
  }
}
