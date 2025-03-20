/**
 * Environment Configuration
 *
 * This module handles environment variables and bindings for the Cloudflare Worker.
 * It provides a typed interface for accessing environment variables and ensures
 * all required variables are present.
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
  DISCORD_WEBHOOK_URL?: string;

  // Configuration
  ENVIRONMENT: "development" | "production";
  LOG_LEVEL: "debug" | "info" | "warn" | "error";
  MAX_STORIES_PER_FETCH: number;
  CONTENT_PROCESSOR_BATCH_SIZE: number;
  CONTENT_PROCESSOR_CONCURRENCY: number;
  SUMMARY_GENERATOR_BATCH_SIZE: number;
  NOTIFICATION_SENDER_BATCH_SIZE: number;
  SUMMARIZATION_MAX_TOKENS: number;
}

// Singleton class to access environment variables
export class ENV {
  private static instance: EnvBindings;

  /**
   * Initialize the environment with the provided bindings
   */
  static init(env: EnvBindings): void {
    this.instance = env;
    this.validateEnv();

    // Set log level from environment
    logger.setLevel(env.LOG_LEVEL || "info");
  }

  /**
   * Get an environment variable
   */
  static get<K extends keyof EnvBindings>(key: K): EnvBindings[K] {
    if (!this.instance) {
      throw new Error("Environment not initialized");
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

    // Set default values for optional environment variables
    if (!this.instance.ENVIRONMENT) {
      this.instance.ENVIRONMENT = ENV_DEFAULTS.ENVIRONMENT;
    }

    if (!this.instance.MAX_STORIES_PER_FETCH) {
      this.instance.MAX_STORIES_PER_FETCH = ENV_DEFAULTS.MAX_STORIES_PER_FETCH;
    }

    if (!this.instance.CONTENT_PROCESSOR_BATCH_SIZE) {
      this.instance.CONTENT_PROCESSOR_BATCH_SIZE =
        ENV_DEFAULTS.CONTENT_PROCESSOR_BATCH_SIZE;
    }

    if (!this.instance.CONTENT_PROCESSOR_CONCURRENCY) {
      this.instance.CONTENT_PROCESSOR_CONCURRENCY =
        ENV_DEFAULTS.CONTENT_PROCESSOR_CONCURRENCY;
    }

    if (!this.instance.SUMMARY_GENERATOR_BATCH_SIZE) {
      this.instance.SUMMARY_GENERATOR_BATCH_SIZE =
        ENV_DEFAULTS.SUMMARY_GENERATOR_BATCH_SIZE;
    }

    if (!this.instance.NOTIFICATION_SENDER_BATCH_SIZE) {
      this.instance.NOTIFICATION_SENDER_BATCH_SIZE =
        ENV_DEFAULTS.NOTIFICATION_SENDER_BATCH_SIZE;
    }

    if (!this.instance.SUMMARIZATION_MAX_TOKENS) {
      this.instance.SUMMARIZATION_MAX_TOKENS =
        ENV_DEFAULTS.SUMMARIZATION_MAX_TOKENS;
    }
  }
}
