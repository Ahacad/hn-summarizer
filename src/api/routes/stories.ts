/**
 * Stories API Routes
 *
 * This module handles API routes for retrieving story information.
 */

import { StoryRepository } from "../../storage/d1/story-repository";
import { ProcessingStatus } from "../../types/story";
import { logger } from "../../utils/logger";

/**
 * Stories API handler
 *
 * @param request Request object
 * @param env Environment variables
 * @param ctx Execution context
 * @returns Response
 */
export async function storiesHandler(
  request: Request,
  env: any,
  ctx: ExecutionContext,
): Promise<Response> {
  try {
    const storyRepo = new StoryRepository();
    const url = new URL(request.url);

    // Parse query parameters
    const status = url.searchParams.get("status") as ProcessingStatus | null;
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 10;

    // Validate limit parameter
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return new Response(
        JSON.stringify({ error: "Invalid limit parameter (must be 1-100)" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Get stories based on status
    let stories = [];
    if (status) {
      // Validate status parameter
      if (!Object.values(ProcessingStatus).includes(status)) {
        return new Response(
          JSON.stringify({ error: "Invalid status parameter" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      stories = await storyRepo.getStoriesByStatus(status, limit);
      logger.debug("Fetched stories by status", {
        status,
        count: stories.length,
      });
    } else {
      // Get latest processed stories (both completed and sent)
      stories = await storyRepo.getLatestProcessedStories(limit);
      logger.debug("Fetched latest processed stories", {
        count: stories.length,
      });
    }

    return new Response(
      JSON.stringify({
        stories,
        count: stories.length,
        limit,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "max-age=60", // Cache for 1 minute
        },
      },
    );
  } catch (error) {
    logger.error("Error in stories API handler", { error });

    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
