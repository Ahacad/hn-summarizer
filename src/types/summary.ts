/**
 * Summary Types
 * 
 * This module defines TypeScript interfaces for summaries.
 * These types represent the internal data structures used by the application.
 */

import { HNStoryID } from './hackernews';

/**
 * Represents a generated summary
 */
export interface Summary {
  /** The HackerNews story ID */
  storyId: HNStoryID;
  
  /** The main summary text */
  summary: string;
  
  /** A very short (1-2 sentence) version of the summary */
  shortSummary?: string;
  
  /** The key points extracted from the content */
  keyPoints?: string[];
  
  /** Estimated reading time in minutes for the original content */
  estimatedReadingTime?: number;
  
  /** Topics or categories identified in the content */
  topics?: string[];
  
  /** The LLM model used for summarization */
  model: string;
  
  /** Number of tokens used for the input */
  inputTokens: number;
  
  /** Number of tokens in the response */
  outputTokens: number;
  
  /** Timestamp when the summary was generated */
  generatedAt: string;
  
  /** Additional metadata about the summary */
  metadata?: Record<string, any>;
}

/**
 * Format options for summary delivery
 */
export enum SummaryFormat {
  /** Plain text */
  TEXT = 'text',
  
  /** Markdown */
  MARKDOWN = 'markdown',
  
  /** HTML */
  HTML = 'html'
}

/**
 * Summary delivery configuration
 */
export interface SummaryDeliveryConfig {
  /** The format to use */
  format: SummaryFormat;
  
  /** Whether to include key points */
  includeKeyPoints: boolean;
  
  /** Whether to include reading time */
  includeReadingTime: boolean;
  
  /** Whether to include topics */
  includeTopics: boolean;
  
  /** Whether to include the original URL */
  includeUrl: boolean;
}

/**
 * Notification status for a summary
 */
export enum NotificationStatus {
  /** Not yet sent */
  PENDING = 'pending',
  
  /** Currently being sent */
  SENDING = 'sending',
  
  /** Successfully sent */
  SENT = 'sent',
  
  /** Failed to send */
  FAILED = 'failed'
}
