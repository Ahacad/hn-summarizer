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
  private client: WebhookClient | null = null;

  /**
   * Create a new Discord notifier
   *
   * @param webhookUrl Discord webhook URL
   */
  constructor(webhookUrl?: string) {
    // Get webhook URL from environment if not provided
    const url = webhookUrl || ENV.get("DISCORD_WEBHOOK_URL");

    // Initialize the client if URL is available
    if (url) {
      this.client = new WebhookClient({ url });
    } else {
      logger.warn("Discord webhook URL not configured");
    }
  }

  /**
   * Check if the service is configured
   */
  isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Send a summary notification
   *
   * @param story Original HackerNews story
   * @param summary Generated summary
   * @returns Whether the message was sent successfully
   */
  async sendSummary(story: HNStory, summary: Summary): Promise<boolean> {
    if (!this.isConfigured()) {
      logger.warn("Discord notifier not properly configured");
      return false;
    }

    try {
      // Create the embed
      const embed = this.createEmbed(story, summary);

      // Send the message
      await this.client!.send({
        embeds: [embed],
      });

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
   * Create a Discord embed for the summary
   */
  private createEmbed(story: HNStory, summary: Summary): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle(story.title)
      .setTimestamp();

    // Set URL if available
    if (story.url) {
      embed.setURL(story.url);
    }

    // Set description (short summary or beginning of main summary)
    const description =
      summary.shortSummary || this.truncateText(summary.summary, 300);
    embed.setDescription(description);

    // Add the main summary as a field if it's not the same as the short summary
    if (summary.shortSummary && summary.summary) {
      embed.addFields({
        name: "Summary",
        value: this.truncateText(summary.summary, 1024),
      });
    }

    // Add key points if available
    if (summary.keyPoints && summary.keyPoints.length > 0) {
      const keyPoints = summary.keyPoints
        .map((point) => `• ${point}`)
        .join("\n");

      embed.addFields({
        name: "Key Points",
        value: this.truncateText(keyPoints, 1024),
      });
    }

    // Add topics if available
    if (summary.topics && summary.topics.length > 0) {
      embed.addFields({
        name: "Topics",
        value: summary.topics.join(", "),
        inline: true,
      });
    }

    // Add reading time if available
    if (summary.estimatedReadingTime) {
      embed.addFields({
        name: "Reading Time",
        value: `${summary.estimatedReadingTime} min`,
        inline: true,
      });
    }

    // Add HackerNews link
    embed.addFields({
      name: "HackerNews",
      value: `[Discussion](https://news.ycombinator.com/item?id=${story.id})`,
      inline: true,
    });

    // Add footer with metadata
    embed.setFooter({
      text: `Score: ${story.score} | By: ${story.by} | Summarized by HN Summarizer`,
    });

    return embed;
  }

  /**
   * Truncate text to the specified maximum length
   */
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
