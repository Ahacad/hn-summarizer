/**
 * Content Processor Worker
 * 
 * This worker extracts content from story URLs and saves it to R2.
 * It processes stories that have been fetched but not yet extracted.
 */

import { ContentExtractor } from '../services/content/extractor';
import { StoryRepository } from '../storage/d1/story-repository';
import { ContentRepository } from '../storage/r2/content-repository';
import { ProcessingStatus } from '../types/story';
import { logger } from '../utils/logger';

/**
 * Handler for the content processor worker
 */
export async function contentProcessorHandler(
  request: Request,
  env: any,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    logger.info('Starting content processor worker');
    
    // Initialize dependencies
    const contentExtractor = new ContentExtractor();
    const storyRepo = new StoryRepository();
    const contentRepo = new ContentRepository();
    
    // Get stories that need processing
    const stories = await storyRepo.getStoriesByStatus(ProcessingStatus.PENDING, 10);
    logger.info('Found stories to process', { count: stories.length });
    
    // Process each story
    let successCount = 0;
    let failureCount = 0;
    
    for (const story of stories) {
      try {
        // Update status to extracting
        await storyRepo.updateStatus(story.id, ProcessingStatus.EXTRACTING);
        
        // Skip if no URL
        if (!story.url) {
          logger.warn('Story has no URL, skipping', { storyId: story.id });
          await storyRepo.updateStatus(
            story.id, 
            ProcessingStatus.FAILED, 
            'No URL provided'
          );
          failureCount++;
          continue;
        }
        
        // Extract content
        const content = await contentExtractor.extract(story.url);
        
        if (!content) {
          logger.warn('Failed to extract content', { storyId: story.id, url: story.url });
          await storyRepo.updateStatus(
            story.id, 
            ProcessingStatus.FAILED, 
            'Failed to extract content'
          );
          failureCount++;
          continue;
        }
        
        // Save content to R2
        const contentId = await contentRepo.saveContent(story.id, content);
        
        if (!contentId) {
          logger.error('Failed to save content to R2', { storyId: story.id });
          await storyRepo.updateStatus(
            story.id, 
            ProcessingStatus.FAILED, 
            'Failed to save content'
          );
          failureCount++;
          continue;
        }
        
        // Update story with content ID and status
        await storyRepo.updateContentId(story.id, contentId);
        await storyRepo.updateStatus(story.id, ProcessingStatus.EXTRACTED);
        
        logger.info('Successfully processed story content', { 
          storyId: story.id, 
          contentId,
          wordCount: content.wordCount
        });
        
        successCount++;
      } catch (error) {
        logger.error('Error processing story content', { error, storyId: story.id });
        await storyRepo.updateStatus(
          story.id, 
          ProcessingStatus.FAILED, 
          `Error: ${error.message}`
        );
        failureCount++;
      }
    }
    
    logger.info('Content processor completed', { 
      success: successCount, 
      failure: failureCount,
      total: stories.length
    });
    
    return new Response(JSON.stringify({
      success: true,
      processed: successCount,
      failed: failureCount,
      total: stories.length
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    logger.error('Error in content processor worker', { error });
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}
