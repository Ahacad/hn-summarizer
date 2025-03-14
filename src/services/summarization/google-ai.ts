/**
 * Google AI Summarization Service
 * 
 * This module provides functions for summarizing content using Google's AI APIs.
 * It handles sending text to the Google Generative Language API and processing
 * the responses.
 */

import { TextServiceClient } from '@google-ai/generativelanguage';
import { GoogleAuth } from 'google-auth-library';
import { logger } from '../../utils/logger';
import { ENV } from '../../config/environment';
import { Summary } from '../../types/summary';
import { promptTemplates } from './prompt-templates';
import { HNStoryID } from '../../types/hackernews';

/**
 * Summarization service using Google AI
 */
export class GoogleAISummarizer {
  private client: TextServiceClient;
  private model = 'models/text-bison-001';
  private maxLength: number;
  
  /**
   * Create a new Google AI summarizer
   * 
   * @param apiKey Google AI API key
   * @param maxLength Maximum length for summaries
   */
  constructor(apiKey?: string, maxLength = 300) {
    // Get API key from environment if not provided
    const key = apiKey || ENV.get('GOOGLE_AI_API_KEY');
    
    if (!key) {
      throw new Error('Google AI API key is required');
    }
    
    this.maxLength = maxLength;
    
    // Initialize the Google AI client
    this.client = new TextServiceClient({
      authClient: new GoogleAuth().fromAPIKey(key),
    });
  }
  
  /**
   * Generate a summary for the given content
   * 
   * @param storyId The HackerNews story ID
   * @param title The title of the story
   * @param content The content to summarize
   * @param maxTokens Maximum tokens for the summary
   * @returns The generated summary
   */
  async summarize(
    storyId: HNStoryID, 
    title: string, 
    content: string, 
    maxTokens = 300
  ): Promise<Summary> {
    try {
      logger.info('Generating summary', { storyId, contentLength: content.length });
      
      // Prepare the prompt
      const prompt = this.preparePrompt(title, content);
      
      // Track the start time for performance monitoring
      const startTime = Date.now();
      
      // Generate the summary using Google AI
      const [response] = await this.client.generateText({
        model: this.model,
        prompt: {
          text: prompt,
        },
        temperature: 0.2,  // Lower temperature for more focused summaries
        maxOutputTokens: maxTokens,
        topK: 40,
        topP: 0.95,
      });
      
      // Track the end time
      const endTime = Date.now();
      
      // Process the response
      if (!response.candidates || response.candidates.length === 0) {
        throw new Error('No summary generated');
      }
      
      const generatedText = response.candidates[0].output?.trim() || '';
      
      // Parse the summary data from the generated text
      const summary = this.parseSummaryResponse(generatedText);
      
      // Create the summary object
      const result: Summary = {
        storyId,
        summary: summary.summary,
        shortSummary: summary.shortSummary,
        keyPoints: summary.keyPoints,
        topics: summary.topics,
        estimatedReadingTime: this.estimateReadingTime(content),
        model: this.model,
        inputTokens: this.estimateTokenCount(prompt),
        outputTokens: this.estimateTokenCount(generatedText),
        generatedAt: new Date().toISOString(),
        metadata: {
          processingTimeMs: endTime - startTime,
          contentLength: content.length,
          originalTitle: title
        }
      };
      
      logger.info('Summary generated successfully', { 
        storyId, 
        summaryLength: result.summary.length,
        processingTimeMs: endTime - startTime
      });
      
      return result;
    } catch (error) {
      logger.error('Error generating summary', { error, storyId });
      throw error;
    }
  }
  
  /**
   * Prepare the prompt for the LLM
   */
  private preparePrompt(title: string, content: string): string {
    // Truncate content if it's too long
    const truncatedContent = this.truncateContent(content);
    
    // Format the prompt using the template
    return promptTemplates.summary
      .replace('{{TITLE}}', title)
      .replace('{{CONTENT}}', truncatedContent);
  }
  
  /**
   * Truncate content to a reasonable length for the LLM
   */
  private truncateContent(content: string): string {
    // Rough estimate: 1 token ≈ 4 characters for English text
    const maxChars = 6000;  // Leaves room for the prompt and response
    
    if (content.length <= maxChars) {
      return content;
    }
    
    // Truncate and add indicator
    return content.substring(0, maxChars) + '... [content truncated due to length]';
  }
  
  /**
   * Parse the summary response from the LLM
   */
  private parseSummaryResponse(text: string): {
    summary: string;
    shortSummary?: string;
    keyPoints?: string[];
    topics?: string[];
  } {
    // Default structure if parsing fails
    const defaultResult = {
      summary: text.trim(),
    };
    
    try {
      // Try to extract structured data
      
      // Extract summary
      const summaryMatch = text.match(/SUMMARY:(.+?)(?=SHORT SUMMARY:|KEY POINTS:|TOPICS:|$)/s);
      const summary = summaryMatch ? summaryMatch[1].trim() : text.trim();
      
      // Extract short summary
      const shortSummaryMatch = text.match(/SHORT SUMMARY:(.+?)(?=KEY POINTS:|TOPICS:|$)/s);
      const shortSummary = shortSummaryMatch ? shortSummaryMatch[1].trim() : undefined;
      
      // Extract key points
      const keyPointsMatch = text.match(/KEY POINTS:(.+?)(?=TOPICS:|$)/s);
      let keyPoints: string[] | undefined = undefined;
      
      if (keyPointsMatch) {
        const keyPointsText = keyPointsMatch[1].trim();
        keyPoints = keyPointsText
          .split(/\n-|\n\*/)
          .map(point => point.trim())
          .filter(point => point.length > 0);
      }
      
      // Extract topics
      const topicsMatch = text.match(/TOPICS:(.+?)$/s);
      let topics: string[] | undefined = undefined;
      
      if (topicsMatch) {
        const topicsText = topicsMatch[1].trim();
        topics = topicsText
          .split(/,|\n-|\n\*/)
          .map(topic => topic.trim())
          .filter(topic => topic.length > 0);
      }
      
      return {
        summary,
        shortSummary,
        keyPoints,
        topics
      };
    } catch (error) {
      logger.warn('Failed to parse structured summary response', { error });
      return defaultResult;
    }
  }
  
  /**
   * Estimate reading time for content
   */
  private estimateReadingTime(content: string): number {
    // Average reading speed: 200-250 words per minute
    const wordsPerMinute = 225;
    const wordCount = content.split(/\s+/).length;
    const readingTime = wordCount / wordsPerMinute;
    
    // Round to nearest half minute, with minimum of 1 minute
    return Math.max(1, Math.round(readingTime * 2) / 2);
  }
  
  /**
   * Rough estimate of token count
   */
  private estimateTokenCount(text: string): number {
    // Simple approximation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }
}
