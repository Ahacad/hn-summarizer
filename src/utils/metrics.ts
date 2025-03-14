/**
 * Metrics Utility
 * 
 * This module provides utilities for tracking metrics throughout the application.
 * It handles recording performance data, API usage, and costs.
 */

import { logger } from './logger';
import { ENV } from '../config/environment';

/**
 * Metric types
 */
export enum MetricType {
  STORY_FETCHED = 'story_fetched',
  CONTENT_EXTRACTED = 'content_extracted',
  SUMMARY_GENERATED = 'summary_generated',
  NOTIFICATION_SENT = 'notification_sent',
  API_TOKENS_USED = 'api_tokens_used',
  API_COST = 'api_cost',
  ERROR = 'error',
  LATENCY = 'latency'
}

/**
 * Metrics service
 */
class MetricsService {
  private metrics: Map<string, number> = new Map();
  private enabled: boolean = true;
  
  /**
   * Initialize the metrics service
   */
  constructor() {
    // Initialize counters for each metric type
    Object.values(MetricType).forEach(type => {
      this.metrics.set(type, 0);
    });
    
    // Disable metrics in test environment
    if (ENV.get('ENVIRONMENT') === 'test') {
      this.enabled = false;
    }
  }
  
  /**
   * Increment a counter metric
   * 
   * @param type Metric type
   * @param value Value to increment by (default: 1)
   */
  increment(type: MetricType, value = 1): void {
    if (!this.enabled) return;
    
    const currentValue = this.metrics.get(type) || 0;
    this.metrics.set(type, currentValue + value);
    
    logger.debug('Metric incremented', { type, value, total: currentValue + value });
  }
  
  /**
   * Set an absolute metric value
   * 
   * @param type Metric type
   * @param value Value to set
   */
  set(type: MetricType, value: number): void {
    if (!this.enabled) return;
    
    this.metrics.set(type, value);
    
    logger.debug('Metric set', { type, value });
  }
  
  /**
   * Get the current value of a metric
   * 
   * @param type Metric type
   * @returns Current value
   */
  get(type: MetricType): number {
    return this.metrics.get(type) || 0;
  }
  
  /**
   * Get all metrics
   * 
   * @returns Object with all metrics
   */
  getAll(): Record<string, number> {
    const result: Record<string, number> = {};
    
    for (const [key, value] of this.metrics.entries()) {
      result[key] = value;
    }
    
    return result;
  }
  
  /**
   * Reset all metrics
   */
  reset(): void {
    Object.values(MetricType).forEach(type => {
      this.metrics.set(type, 0);
    });
    
    logger.debug('Metrics reset');
  }
  
  /**
   * Track API usage and cost
   * 
   * @param inputTokens Number of input tokens
   * @param outputTokens Number of output tokens
   * @param model Model name
   */
  trackAPIUsage(inputTokens: number, outputTokens: number, model: string): void {
    if (!this.enabled) return;
    
    // Increment token counts
    this.increment(MetricType.API_TOKENS_USED, inputTokens + outputTokens);
    
    // Calculate cost (approximate)
    // These rates should be moved to constants and updated as pricing changes
    let costPerInputToken = 0;
    let costPerOutputToken = 0;
    
    if (model.includes('gemini-2.0-flash')) {
      costPerInputToken = 0.00000025; // $0.00025 per 1000 tokens
      costPerOutputToken = 0.00000075; // $0.00075 per 1000 tokens
    } else if (model.includes('gemini-2.0-pro')) {
      costPerInputToken = 0.0000005; // $0.0005 per 1000 tokens
      costPerOutputToken = 0.0000015; // $0.0015 per 1000 tokens
    }
    
    const cost = (inputTokens * costPerInputToken) + (outputTokens * costPerOutputToken);
    
    // Add to total cost
    const currentCost = this.get(MetricType.API_COST);
    this.set(MetricType.API_COST, currentCost + cost);
    
    logger.debug('API usage tracked', { 
      inputTokens, 
      outputTokens, 
      model, 
      cost,
      totalCost: currentCost + cost
    });
  }
  
  /**
   * Time a function execution
   * 
   * @param label Label for the timing
   * @param fn Function to time
   * @returns Result of the function
   */
  async time<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    
    try {
      return await fn();
    } finally {
      const duration = Date.now() - startTime;
      
      logger.debug('Function timing', { label, durationMs: duration });
      
      // Store in metrics if enabled
      if (this.enabled) {
        const key = `${MetricType.LATENCY}_${label}`;
        this.metrics.set(key, duration);
      }
    }
  }
}

// Export a singleton instance
export const metrics = new MetricsService();
