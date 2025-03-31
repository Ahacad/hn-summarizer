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
    DEFAULT_MODEL: "gemini-2.5-pro-exp-03-25",

    /** Default maximum tokens for output */
    DEFAULT_MAX_TOKENS: 65536,

    /** Default temperature for generation */
    DEFAULT_TEMPERATURE: 0.2,

    /** Maximum character length for content before truncation
     * With the new model's large input window, we can process much more content
     */
    MAX_CONTENT_CHARS: 1000000,

    /** Input token limit for the model */
    MAX_INPUT_TOKENS: 1048576,
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

    /** Approximate characters per token for code or specialized content */
    CHARS_PER_CODE_TOKEN: 2,
  },

  /**
   * Retry configuration
   */
  RETRY: {
    /** Default maximum number of retries */
    DEFAULT_MAX_RETRIES: 3,
  },
};

/**
 * Cron schedule constants
 */
export const CRON = {
  /** Fetch new stories every 30 minutes */
  FETCH_STORIES: "*/30 * * * *",

  /** Process content every 60 minutes */
  PROCESS_CONTENT: "*/60 * * * *",

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
  CONTENT_PROCESSOR_CONCURRENCY: 1,

  /** Default maximum stories per summary generation run */
  SUMMARY_GENERATOR_BATCH_SIZE: 5,

  /** Default concurrency for summary generation */
  SUMMARY_GENERATOR_CONCURRENCY: 3,

  /** Default maximum stories per notification run */
  NOTIFICATION_SENDER_BATCH_SIZE: 5,

  /** Default concurrency for sending notifications */
  NOTIFICATION_SENDER_CONCURRENCY: 1,

  /** Default maximum tokens for summarization */
  SUMMARIZATION_MAX_TOKENS: 2048,

  /** Default maximum retry attempts */
  MAX_RETRY_ATTEMPTS: 5,
};
