/**
 * Telegram Notification Service
 * 
 * This module provides functions for sending notifications to Telegram.
 * It handles formatting summaries for Telegram and sending messages
 * through the Telegram Bot API.
 */

import { Telegraf } from 'telegraf';
import { logger } from '../../utils/logger';
import { ENV } from '../../config/environment';
import { Summary, SummaryFormat } from '../../types/summary';
import { HNStory } from '../../types/hackernews';

/**
 * Telegram notification service
 */
export class TelegramNotifier {
  private bot: Telegraf | null = null;
  private chatId: string | null = null;
  
  /**
   * Create a new Telegram notifier
   * 
   * @param token Telegram bot token
   * @param chatId Chat ID to send messages to
   */
  constructor(token?: string, chatId?: string) {
    // Get token from environment if not provided
    const botToken = token || ENV.get('TELEGRAM_BOT_TOKEN');
    
    // Initialize the bot if token is available
    if (botToken) {
      this.bot = new Telegraf(botToken);
      this.chatId = chatId || process.env.TELEGRAM_CHAT_ID || null;
    } else {
      logger.warn('Telegram bot token not configured');
    }
  }
  
  /**
   * Check if the service is configured
   */
  isConfigured(): boolean {
    return this.bot !== null && this.chatId !== null;
  }
  
  /**
   * Send a summary notification
   * 
   * @param story Original HackerNews story
   * @param summary Generated summary
   * @param chatId Optional override for the default chat ID
   * @returns Whether the message was sent successfully
   */
  async sendSummary(
    story: HNStory, 
    summary: Summary, 
    chatId?: string
  ): Promise<boolean> {
    if (!this.isConfigured()) {
      logger.warn('Telegram notifier not properly configured');
      return false;
    }
    
    try {
      const targetChatId = chatId || this.chatId;
      
      if (!targetChatId) {
        logger.warn('No Telegram chat ID configured');
        return false;
      }
      
      // Format the message
      const message = this.formatSummary(story, summary, SummaryFormat.MARKDOWN);
      
      // Send the message
      await this.bot!.telegram.sendMessage(targetChatId, message, {
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: false
      });
      
      logger.info('Summary sent to Telegram', { 
        storyId: story.id, 
        chatId: targetChatId 
      });
      
      return true;
    } catch (error) {
      logger.error('Error sending summary to Telegram', { error, storyId: story.id });
      return false;
    }
  }
  
  /**
   * Format a summary for Telegram
   * 
   * @param story Original HackerNews story
   * @param summary Generated summary
   * @param format Desired format
   * @returns Formatted message
   */
  private formatSummary(
    story: HNStory,
    summary: Summary,
    format: SummaryFormat
  ): string {
    switch (format) {
      case SummaryFormat.MARKDOWN:
        return this.formatMarkdown(story, summary);
      case SummaryFormat.TEXT:
        return this.formatText(story, summary);
      default:
        return this.formatText(story, summary);
    }
  }
  
  /**
   * Format a summary as plain text
   */
  private formatText(story: HNStory, summary: Summary): string {
    let message = `📰 ${story.title}\n\n`;
    
    // Add short summary if available
    if (summary.shortSummary) {
      message += `${summary.shortSummary}\n\n`;
    }
    
    // Add main summary
    message += `${summary.summary}\n\n`;
    
    // Add key points if available
    if (summary.keyPoints && summary.keyPoints.length > 0) {
      message += `Key Points:\n`;
      for (const point of summary.keyPoints) {
        message += `• ${point}\n`;
      }
      message += '\n';
    }
    
    // Add reading time if available
    if (summary.estimatedReadingTime) {
      message += `📚 ${summary.estimatedReadingTime} min read\n\n`;
    }
    
    // Add link to original article
    if (story.url) {
      message += `Original: ${story.url}\n`;
    }
    
    // Add link to HackerNews discussion
    message += `HN: https://news.ycombinator.com/item?id=${story.id}\n`;
    
    return message;
  }
  
  /**
   * Format a summary as Markdown (with Telegram escaping)
   */
  private formatMarkdown(story: HNStory, summary: Summary): string {
    // Escape Markdown characters
    const escape = (text: string): string => {
      return text
        .replace(/\_/g, '\\_')
        .replace(/\*/g, '\\*')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/\~/g, '\\~')
        .replace(/\`/g, '\\`')
        .replace(/\>/g, '\\>')
        .replace(/\#/g, '\\#')
        .replace(/\+/g, '\\+')
        .replace(/\-/g, '\\-')
        .replace(/\=/g, '\\=')
        .replace(/\|/g, '\\|')
        .replace(/\{/g, '\\{')
        .replace(/\}/g, '\\}')
        .replace(/\./g, '\\.')
        .replace(/\!/g, '\\!');
    };
    
    let message = `*📰 ${escape(story.title)}*\n\n`;
    
    // Add short summary if available
    if (summary.shortSummary) {
      message += `_${escape(summary.shortSummary)}_\n\n`;
    }
    
    // Add main summary
    message += `${escape(summary.summary)}\n\n`;
    
    // Add key points if available
    if (summary.keyPoints && summary.keyPoints.length > 0) {
      message += `*Key Points:*\n`;
      for (const point of summary.keyPoints) {
        message += `• ${escape(point)}\n`;
      }
      message += '\n';
    }
    
    // Add reading time if available
    if (summary.estimatedReadingTime) {
      message += `📚 _${summary.estimatedReadingTime} min read_\n\n`;
    }
    
    // Add link to original article if available
    if (story.url) {
      // Don't escape URLs
      message += `[Original Article](${story.url})\n`;
    }
    
    // Add link to HackerNews discussion
    message += `[HackerNews Discussion](https://news.ycombinator.com/item?id=${story.id})\n`;
    
    return message;
  }
}
