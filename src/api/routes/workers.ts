/**
 * Workers API Routes
 *
 * This module provides API endpoints for managing worker run times.
 * It allows getting worker status and manually resetting worker run times.
 */

import { StoryRepository } from "../../storage/d1/story-repository";
import { logger } from "../../utils/logger";

/**
 * Workers API handler
 *
 * @param request Request object
 * @param env Environment variables
 * @param ctx Execution context
 * @returns Response
 */
export async function workersHandler(
  request: Request,
  env: any,
  ctx: ExecutionContext,
): Promise<Response> {
  try {
    const storyRepo = new StoryRepository();
    const url = new URL(request.url);
    const action = url.searchParams.get("action");
    const workerName = url.searchParams.get("worker");

    // List workers and their last run times
    if (request.method === "GET" && !action) {
      return await getWorkerTimes(storyRepo);
    }

    // Reset worker run time - requires worker name
    if (request.method === "POST" && action === "reset" && workerName) {
      return await resetWorkerTime(storyRepo, workerName);
    }

    // Invalid request
    return new Response(
      JSON.stringify({
        error: "Invalid request. Try GET or POST with action=reset&worker=name",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    logger.error("Error in workers API handler", { error });

    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * Get all worker run times
 */
async function getWorkerTimes(storyRepo: StoryRepository): Promise<Response> {
  // Query database for all worker run times
  const results = await storyRepo.db
    .prepare("SELECT * FROM worker_run_times ORDER BY worker_name")
    .all<{ worker_name: string; last_run_time: string; updated_at: string }>();

  return new Response(
    JSON.stringify({
      workers: results.results,
      count: results.results.length,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store", // Don't cache this response
      },
    },
  );
}

/**
 * Reset a worker's run time to far in the past (effectively forcing it to run on next check)
 */
async function resetWorkerTime(
  storyRepo: StoryRepository,
  workerName: string,
): Promise<Response> {
  // Set the run time to a date far in the past (2020-01-01)
  const oldTime = "2020-01-01T00:00:00.000Z";
  const success = await storyRepo.updateWorkerRunTime(workerName, oldTime);

  if (success) {
    logger.info("Worker run time reset", { workerName });
    return new Response(
      JSON.stringify({
        success: true,
        message: `Run time for worker '${workerName}' reset to ${oldTime}`,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } else {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Failed to reset run time for worker '${workerName}'`,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
