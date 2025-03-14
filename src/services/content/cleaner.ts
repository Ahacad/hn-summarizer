/**
 * Content Cleaner
 * 
 * This module provides functions for cleaning extracted content
 * to prepare it for summarization. It removes unnecessary whitespace,
 * code blocks, and other noise.
 */

import { logger } from '../../utils/logger';

/**
 * Content cleaner service
 */
class ContentCleaner {
  /**
   * Clean extracted content
   * 
   * @param content Raw content to clean
   * @returns Cleaned content
   */
  clean(content: string): string {
    if (!content) {
      return '';
    }
    
    logger.debug('Cleaning content', { contentLength: content.length });
    
    let cleaned = content;
    
    // Remove excessive whitespace
    cleaned = this.normalizeWhitespace(cleaned);
    
    // Remove URLs
    // cleaned = this.removeUrls(cleaned);
    
    // Remove common website clutter
    cleaned = this.removeCommonClutter(cleaned);
    
    // Remove email addresses
    // cleaned = this.removeEmails(cleaned);
    
    // Normalize line endings
    cleaned = cleaned.replace(/\r\n/g, '\n');
    
    // Compress multiple newlines to at most two
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    
    logger.debug('Content cleaned', { 
      originalLength: content.length,
      cleanedLength: cleaned.length,
      reductionPercent: ((content.length - cleaned.length) / content.length * 100).toFixed(2)
    });
    
    return cleaned.trim();
  }
  
  /**
   * Extract a summary excerpt from the content
   * 
   * @param content Content to extract from
   * @param maxLength Maximum length of the excerpt
   * @returns Extracted excerpt
   */
  extractExcerpt(content: string, maxLength = 200): string {
    if (!content) {
      return '';
    }
    
    // Clean the content first
    const cleaned = this.clean(content);
    
    // Extract the first few sentences
    const sentences = cleaned.split(/[.!?]/).filter(s => s.trim().length > 0);
    
    let excerpt = '';
    for (const sentence of sentences) {
      if (excerpt.length + sentence.length + 1 > maxLength) {
        break;
      }
      excerpt += sentence.trim() + '. ';
    }
    
    return excerpt.trim();
  }
  
  /**
   * Normalize whitespace in text
   */
  private normalizeWhitespace(text: string): string {
    // Replace tabs with spaces
    let result = text.replace(/\t/g, ' ');
    
    // Replace multiple spaces with a single space
    result = result.replace(/ {2,}/g, ' ');
    
    return result;
  }
  
  /**
   * Remove URLs from text
   */
  private removeUrls(text: string): string {
    // Match common URL patterns
    return text.replace(/https?:\/\/[^\s]+/g, '')
               .replace(/www\.[^\s]+/g, '');
  }
  
  /**
   * Remove common website clutter
   */
  private removeCommonClutter(text: string): string {
    const clutterPatterns = [
      // Common cookie/privacy notifications
      /cookie policy|privacy policy|accept cookies|use cookies|site uses cookies/gi,
      
      // Newsletter subscriptions
      /subscribe to our newsletter|sign up for our newsletter|subscribe now/gi,
      
      // Login/register prompts
      /log in|login|sign in|register|create an account/gi,
      
      // Social media
      /follow us on|share on|tweet|facebook|instagram/gi,
      
      // Navigation clutter
      /menu|navigation|search|home|contact us|about us/gi,
      
      // Comment sections
      /comments|leave a comment|post a comment|show comments/gi,
      
      // Footer items
      /copyright|all rights reserved|terms of service|terms and conditions/gi
    ];
    
    let result = text;
    for (const pattern of clutterPatterns) {
      result = result.replace(pattern, '');
    }
    
    return result;
  }
  
  /**
   * Remove email addresses from text
   */
  private removeEmails(text: string): string {
    return text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '');
  }
}

// Export a singleton instance
export const cleaner = new ContentCleaner();
