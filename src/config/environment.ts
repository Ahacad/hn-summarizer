/**
 * Environment Configuration
 *
 * This module handles environment variables and bindings for the Cloudflare Worker.
 * It provides a typed interface for accessing environment variables and ensures
 * all required variables are present and properly typed.
 */

import { logger } from "../utils/logger";
import { ENV_DEFAULTS } from "./constants";

// Define the shape of environment bindings
export interface EnvBindings {
  // Database bindings
  HN_SUMMARIZER_DB: D1Database;
  CONTENT_BUCKET: R2Bucket;

  // API keys and URLs
  GOOGLE_AI_API_KEY: string;
  FIRECRAWL_API_URL: string; // Required Firecrawl API URL
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  DISCORD_WEBHOOK_URL?: string;

  // Configuration
  ENVIRONMENT: "development" | "production";
  LOG_LEVEL: "debug" | "info" | "warn" | "error";
  MAX_STORIES_PER_FETCH: number;
  CONTENT_PROCESSOR_BATCH_SIZE: number;
  CONTENT_PROCESSOR_CONCURRENCY: number;
  SUMMARY_GENERATOR_BATCH_SIZE: number;
  SUMMARY_GENERATOR_CONCURRENCY: number; // Separate concurrency for summary generation
  NOTIFICATION_SENDER_BATCH_SIZE: number;
  NOTIFICATION_SENDER_CONCURRENCY: number; // Separate concurrency for notifications
  SUMMARIZATION_MAX_TOKENS: number;
  MAX_RETRY_ATTEMPTS: number;

  // Daily Digest Configuration
  DIGEST_MAX_STORIES?: number;
  DIGEST_MIN_STORIES?: number;
  DIGEST_FORMAT?: string;
  DIGEST_GROUPING?: string;
}

// Singleton class to access environment variables
export class ENV {
  private static instance: EnvBindings;

  /**
   * Initialize the environment with the provided bindings
   */
  static init(env: any): void {
    logger.debug("Initializing environment", {
      envKeys: Object.keys(env),
      hasSecrets: !!(
        env.GOOGLE_AI_API_KEY ||
        env.TELEGRAM_BOT_TOKEN ||
        env.DISCORD_WEBHOOK_URL
      ),
      hasBindings: !!(env.HN_SUMMARIZER_DB && env.CONTENT_BUCKET),
    });

    // Create a properly typed version of the environment
    this.instance = {
      // Direct bindings
      HN_SUMMARIZER_DB: env.HN_SUMMARIZER_DB,
      CONTENT_BUCKET: env.CONTENT_BUCKET,
      GOOGLE_AI_API_KEY: env.GOOGLE_AI_API_KEY,
      FIRECRAWL_API_URL: env.FIRECRAWL_API_URL,
      TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
      TELEGRAM_CHAT_ID: env.TELEGRAM_CHAT_ID,
      DISCORD_WEBHOOK_URL: env.DISCORD_WEBHOOK_URL,

      // String values
      ENVIRONMENT: (env.ENVIRONMENT || ENV_DEFAULTS.ENVIRONMENT) as
        | "development"
        | "production",
      LOG_LEVEL: (env.LOG_LEVEL || ENV_DEFAULTS.LOG_LEVEL) as
        | "debug"
        | "info"
        | "warn"
        | "error",

      // Number values - ensure all numeric values are properly converted from strings
      MAX_STORIES_PER_FETCH: this.parseNumericEnv(
        env.MAX_STORIES_PER_FETCH,
        ENV_DEFAULTS.MAX_STORIES_PER_FETCH,
      ),
      CONTENT_PROCESSOR_BATCH_SIZE: this.parseNumericEnv(
        env.CONTENT_PROCESSOR_BATCH_SIZE,
        ENV_DEFAULTS.CONTENT_PROCESSOR_BATCH_SIZE,
      ),
      CONTENT_PROCESSOR_CONCURRENCY: this.parseNumericEnv(
        env.CONTENT_PROCESSOR_CONCURRENCY,
        ENV_DEFAULTS.CONTENT_PROCESSOR_CONCURRENCY,
      ),
      SUMMARY_GENERATOR_BATCH_SIZE: this.parseNumericEnv(
        env.SUMMARY_GENERATOR_BATCH_SIZE,
        ENV_DEFAULTS.SUMMARY_GENERATOR_BATCH_SIZE,
      ),
      SUMMARY_GENERATOR_CONCURRENCY: this.parseNumericEnv(
        env.SUMMARY_GENERATOR_CONCURRENCY,
        ENV_DEFAULTS.SUMMARY_GENERATOR_CONCURRENCY,
      ),
      NOTIFICATION_SENDER_BATCH_SIZE: this.parseNumericEnv(
        env.NOTIFICATION_SENDER_BATCH_SIZE,
        ENV_DEFAULTS.NOTIFICATION_SENDER_BATCH_SIZE,
      ),
      NOTIFICATION_SENDER_CONCURRENCY: this.parseNumericEnv(
        env.NOTIFICATION_SENDER_CONCURRENCY,
        ENV_DEFAULTS.NOTIFICATION_SENDER_CONCURRENCY,
      ),
      SUMMARIZATION_MAX_TOKENS: this.parseNumericEnv(
        env.SUMMARIZATION_MAX_TOKENS,
        ENV_DEFAULTS.SUMMARIZATION_MAX_TOKENS,
      ),
      MAX_RETRY_ATTEMPTS: this.parseNumericEnv(
        env.MAX_RETRY_ATTEMPTS,
        ENV_DEFAULTS.MAX_RETRY_ATTEMPTS,
      ),

      // Daily Digest Configuration
      DIGEST_MAX_STORIES: this.parseNumericEnv(
        env.DIGEST_MAX_STORIES,
        ENV_DEFAULTS.DIGEST_MAX_STORIES,
      ),
      DIGEST_MIN_STORIES: this.parseNumericEnv(
        env.DIGEST_MIN_STORIES,
        ENV_DEFAULTS.DIGEST_MIN_STORIES,
      ),
      DIGEST_FORMAT: env.DIGEST_FORMAT || ENV_DEFAULTS.DIGEST_FORMAT,
      DIGEST_GROUPING: env.DIGEST_GROUPING || ENV_DEFAULTS.DIGEST_GROUPING,
    };

    this.validateEnv();

    // Set log level from environment
    logger.setLevel(this.instance.LOG_LEVEL || "info");

    // Log the initialized numeric configuration values
    logger.debug("Environment initialized with numeric values", {
      MAX_STORIES_PER_FETCH: this.instance.MAX_STORIES_PER_FETCH,

      CONTENT_PROCESSOR_BATCH_SIZE: this.instance.CONTENT_PROCESSOR_BATCH_SIZE,

      CONTENT_PROCESSOR_CONCURRENCY:
        this.instance.CONTENT_PROCESSOR_CONCURRENCY,

      SUMMARY_GENERATOR_BATCH_SIZE: this.instance.SUMMARY_GENERATOR_BATCH_SIZE,

      SUMMARY_GENERATOR_CONCURRENCY:
        this.instance.SUMMARY_GENERATOR_CONCURRENCY,

      NOTIFICATION_SENDER_BATCH_SIZE:
        this.instance.NOTIFICATION_SENDER_BATCH_SIZE,

      NOTIFICATION_SENDER_CONCURRENCY:
        this.instance.NOTIFICATION_SENDER_CONCURRENCY,

      SUMMARIZATION_MAX_TOKENS: this.instance.SUMMARIZATION_MAX_TOKENS,

      MAX_RETRY_ATTEMPTS: this.instance.MAX_RETRY_ATTEMPTS,

      DIGEST_MAX_STORIES: this.instance.DIGEST_MAX_STORIES,
      DIGEST_MIN_STORIES: this.instance.DIGEST_MIN_STORIES,
      DIGEST_FORMAT: this.instance.DIGEST_FORMAT,
      DIGEST_GROUPING: this.instance.DIGEST_GROUPING,
    });
  }

  /**
   * Parse a numeric environment variable, ensuring it's converted to a number
   *
   * @param value The environment variable value (may be a string)
   * @param defaultValue The default value to use if parsing fails
   * @returns The parsed numeric value
   */
  private static parseNumericEnv(value: any, defaultValue: number): number {
    if (value === undefined || value === null) {
      return defaultValue;
    }

    // Try to parse as number
    const parsed = Number(value);

    // Check if parsing succeeded
    if (isNaN(parsed)) {
      logger.warn(
        `Failed to parse numeric environment variable: ${value}, using default: ${defaultValue}`,
      );
      return defaultValue;
    }

    return parsed;
  }

  /**
   * Get an environment variable
   */
  static get<K extends keyof EnvBindings>(key: K): EnvBindings[K] {
    if (!this.instance) {
      logger.warn(`Environment accessed before initialization: ${String(key)}`);

      // For string values, we can safely return defaults
      if (typeof ENV_DEFAULTS[String(key)] === "string") {
        return ENV_DEFAULTS[String(key)] as unknown as EnvBindings[K];
      }

      // For numeric values, return default if available
      if (typeof ENV_DEFAULTS[String(key)] === "number") {
        return ENV_DEFAULTS[String(key)] as unknown as EnvBindings[K];
      }

      // As a last resort, return a safe default (empty string for strings, 0 for numbers)
      return "" as unknown as EnvBindings[K];
    }
    return this.instance[key];
  }

  /**
   * Validate that all required environment variables are present
   */
  private static validateEnv(): void {
    const requiredKeys: (keyof EnvBindings)[] = [
      "HN_SUMMARIZER_DB",
      "CONTENT_BUCKET",
      "GOOGLE_AI_API_KEY",
      "FIRECRAWL_API_URL", // Firecrawl API URL is required
    ];

    for (const key of requiredKeys) {
      if (!this.instance[key]) {
        throw new Error(`Required environment variable ${key} is missing`);
      }
    }

    // Check that at least one notification channel is configured
    if (
      !this.instance.TELEGRAM_BOT_TOKEN &&
      !this.instance.DISCORD_WEBHOOK_URL
    ) {
      logger.warn(
        "No notification channels configured. Notifications will not be sent.",
      );
    }
  }
}
