/**
 * Application Constants
 *
 * This module centralizes all constants used throughout the application.
 * This makes it easier to maintain, update, and document configuration values.
 */

/**
 * API Constants
 */
export const API = {
  /**
   * HackerNews API configuration
   */
  HACKERNEWS: {
    /** Base URL for the HackerNews API */
    BASE_URL: "https://hacker-news.firebaseio.com/v0",

    /** Default cache timeout in milliseconds (5 minutes) */
    CACHE_TIMEOUT: 5 * 60 * 1000,

    /** Default number of stories to fetch */
    DEFAULT_STORY_LIMIT: 30,

    /** Default concurrency for batch requests */
    DEFAULT_CONCURRENCY: 5,
  },

  /**
   * Content extraction configuration
   */
  CONTENT: {
    /** Default user agent for content requests */
    USER_AGENT: "HackerNews Summarizer Bot",

    /** Default timeout for content requests in milliseconds */
    REQUEST_TIMEOUT: 10000,
  },

  /**
   * Google AI configuration
   */
  GOOGLE_AI: {
    /** Default model to use */
    // DEFAULT_MODEL: "gemini-2.0-flash",
    DEFAULT_MODEL: "gemini-2.0-pro-exp-02-05",

    /** Default maximum tokens for summaries */
    DEFAULT_MAX_TOKENS: 8192,

    /** Default temperature for generation */
    DEFAULT_TEMPERATURE: 0.2,

    /** Maximum character length for content before truncation */
    MAX_CONTENT_CHARS: 100000,
  },
};

/**
 * Storage Constants
 */
export const STORAGE = {
  /**
   * R2 storage configuration
   */
  R2: {
    /** Content object prefix */
    CONTENT_PREFIX: "content/",

    /** Summary object prefix */
    SUMMARY_PREFIX: "summary/",
  },
};

/**
 * Processing Constants
 */
export const PROCESSING = {
  /**
   * Reading time estimation
   */
  READING_TIME: {
    /** Average reading speed in words per minute */
    WORDS_PER_MINUTE: 225,
  },

  /**
   * Token estimation
   */
  TOKEN_ESTIMATION: {
    /** Approximate characters per token for English text */
    CHARS_PER_TOKEN: 4,
  },
};

/**
 * Cron schedule constants
 */
export const CRON = {
  /** Fetch new stories every 30 minutes */
  FETCH_STORIES: "*/30 * * * *",

  /** Process content every 15 minutes */
  PROCESS_CONTENT: "*/15 * * * *",

  /** Generate summaries every 10 minutes */
  GENERATE_SUMMARIES: "*/10 * * * *",

  /** Send notifications every 30 minutes */
  SEND_NOTIFICATIONS: "*/30 * * * *",
};

/**
 * Default values for environment variables
 */
export const ENV_DEFAULTS = {
  /** Default environment */
  ENVIRONMENT: "development",

  /** Default log level */
  LOG_LEVEL: "info",

  /** Default maximum stories per fetch */
  MAX_STORIES_PER_FETCH: 30,

  /** Default maximum stories per content processing run */
  CONTENT_PROCESSOR_BATCH_SIZE: 10,

  /** Default concurrency for content processing */
  CONTENT_PROCESSOR_CONCURRENCY: 5,

  /** Default maximum stories per summary generation run */
  SUMMARY_GENERATOR_BATCH_SIZE: 5,

  /** Default maximum stories per notification run */
  NOTIFICATION_SENDER_BATCH_SIZE: 5,

  /** Default maximum tokens for summarization */
  SUMMARIZATION_MAX_TOKENS: 2048,
};
