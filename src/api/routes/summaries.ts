/**
 * Summaries API Routes
 *
 * This module handles API routes for retrieving summary information.
 */

import { StoryRepository } from "../../storage/d1/story-repository";
import { ContentRepository } from "../../storage/r2/content-repository";
import { ProcessingStatus } from "../../types/story";
import { logger } from "../../utils/logger";

/**
 * Summaries API handler
 *
 * @param request Request object
 * @param env Environment variables
 * @param ctx Execution context
 * @returns Response
 */
export async function summariesHandler(
  request: Request,
  env: any,
  ctx: ExecutionContext,
): Promise<Response> {
  try {
    const storyRepo = new StoryRepository();
    const contentRepo = new ContentRepository();
    const url = new URL(request.url);

    // Get story ID from query parameters
    const storyId = url.searchParams.get("storyId");

    if (storyId) {
      // Get summary for a specific story
      const storyIdInt = parseInt(storyId, 10);

      // Validate story ID parameter
      if (isNaN(storyIdInt)) {
        return new Response(
          JSON.stringify({ error: "Invalid storyId parameter" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Get the story
      const story = await storyRepo.getStory(storyIdInt);
      if (!story) {
        return new Response(JSON.stringify({ error: "Story not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Check if summary is available
      if (!story.summaryId) {
        return new Response(
          JSON.stringify({
            error: "Summary not available for this story",
            story,
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Get the summary
      const summary = await contentRepo.getSummary(story.summaryId);
      if (!summary) {
        return new Response(
          JSON.stringify({ error: "Summary not found", story }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      logger.debug("Fetched summary for story", { storyId: storyIdInt });

      return new Response(JSON.stringify({ story, summary }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "max-age=3600", // Cache for 1 hour
        },
      });
    } else {
      // Get latest summaries
      const limitParam = url.searchParams.get("limit");
      const limit = limitParam ? parseInt(limitParam, 10) : 10;

      // Validate limit parameter
      if (isNaN(limit) || limit < 1 || limit > 50) {
        return new Response(
          JSON.stringify({ error: "Invalid limit parameter (must be 1-50)" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Get stories with summaries (completed and sent)
      const statuses = [ProcessingStatus.COMPLETED, ProcessingStatus.SENT];
      const stories = await storyRepo.getStoriesByMultipleStatuses(
        statuses,
        limit,
      );

      // Get summaries for these stories
      const summaries = [];
      for (const story of stories) {
        if (story.summaryId) {
          const summary = await contentRepo.getSummary(story.summaryId);
          if (summary) {
            summaries.push({
              story,
              summary: {
                // Include only essential summary fields for the list view
                shortSummary: summary.shortSummary,
                keyPoints: summary.keyPoints,
                topics: summary.topics,
                estimatedReadingTime: summary.estimatedReadingTime,
                generatedAt: summary.generatedAt,
              },
            });
          }
        }
      }

      logger.debug("Fetched latest summaries", { count: summaries.length });

      return new Response(
        JSON.stringify({
          summaries,
          count: summaries.length,
          limit,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "max-age=300", // Cache for 5 minutes
          },
        },
      );
    }
  } catch (error) {
    logger.error("Error in summaries API handler", { error });

    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
