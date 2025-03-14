/**
 * Story Types
 * 
 * This module defines TypeScript interfaces for processed stories.
 * These types represent the internal data structures used by the application.
 */

import { HNStoryID } from './hackernews';

/**
 * Represents an extracted content from a web page
 */
export interface ExtractedContent {
  /** The URL of the page */
  url: string;
  
  /** The title of the page */
  title: string;
  
  /** The author or byline of the content */
  byline: string | null;
  
  /** The cleaned content for summarization */
  content: string;
  
  /** A short excerpt from the content */
  excerpt: string | null;
  
  /** The name of the site */
  siteName: string | null;
  
  /** The raw text content before cleaning */
  rawContent: string;
  
  /** The raw HTML of the page */
  rawHtml: string;
  
  /** The number of words in the cleaned content */
  wordCount: number;
  
  /** Timestamp when the content was extracted */
  extractedAt: string;
}

/**
 * Processing status for a story
 */
export enum ProcessingStatus {
  PENDING = 'pending',
  EXTRACTING = 'extracting',
  EXTRACTED = 'extracted',
  SUMMARIZING = 'summarizing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

/**
 * Represents a processed story ready for storage
 */
export interface ProcessedStory {
  /** The HackerNews story ID */
  id: HNStoryID;
  
  /** The title of the story */
  title: string;
  
  /** The URL of the story */
  url: string | null;
  
  /** The HackerNews username of the poster */
  by: string;
  
  /** The timestamp of the story (Unix time) */
  time: number;
  
  /** The score of the story */
  score: number;
  
  /** The current processing status */
  status: ProcessingStatus;
  
  /** The content ID in R2 if content was extracted */
  contentId?: string;
  
  /** The summary ID in R2 if a summary was generated */
  summaryId?: string;
  
  /** Timestamp when the story was first processed */
  processedAt: string;
  
  /** Timestamp when the story was last updated */
  updatedAt: string;
  
  /** Error message if processing failed */
  error?: string;
}
