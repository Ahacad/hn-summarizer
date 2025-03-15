import { metrics, MetricType } from "../metrics";
import { ENV } from "../../config/environment";

// Mock environment module
jest.mock("../../config/environment", () => ({
  ENV: {
    get: jest.fn().mockReturnValue("test"),
  },
}));

describe("Metrics", () => {
  beforeEach(() => {
    // Reset metrics between tests
    metrics.reset();
    jest.clearAllMocks();
  });

  describe("increment", () => {
    it("should increment a counter metric", () => {
      // Increment a metric
      metrics.increment(MetricType.STORY_FETCHED);

      // Verify the value
      expect(metrics.get(MetricType.STORY_FETCHED)).toBe(1);

      // Increment again
      metrics.increment(MetricType.STORY_FETCHED);

      // Verify the value increased
      expect(metrics.get(MetricType.STORY_FETCHED)).toBe(2);
    });

    it("should respect the value parameter", () => {
      // Increment by 5
      metrics.increment(MetricType.API_TOKENS_USED, 5);

      // Verify the value
      expect(metrics.get(MetricType.API_TOKENS_USED)).toBe(5);
    });
  });

  describe("set", () => {
    it("should set an absolute metric value", () => {
      // Set a metric
      metrics.set(MetricType.API_COST, 1.25);

      // Verify the value
      expect(metrics.get(MetricType.API_COST)).toBe(1.25);

      // Override with a new value
      metrics.set(MetricType.API_COST, 2.5);

      // Verify the value changed
      expect(metrics.get(MetricType.API_COST)).toBe(2.5);
    });
  });

  describe("get", () => {
    it("should return the current value of a metric", () => {
      // Increment a metric
      metrics.increment(MetricType.SUMMARY_GENERATED, 3);

      // Get the value
      const value = metrics.get(MetricType.SUMMARY_GENERATED);

      // Verify the value
      expect(value).toBe(3);
    });

    it("should return 0 for undefined metrics", () => {
      // Get a metric that hasn't been set
      const value = metrics.get(MetricType.ERROR);

      // Verify the value is 0
      expect(value).toBe(0);
    });
  });

  describe("getAll", () => {
    it("should return all metrics", () => {
      // Set some metrics
      metrics.increment(MetricType.STORY_FETCHED, 5);
      metrics.increment(MetricType.CONTENT_EXTRACTED, 3);
      metrics.set(MetricType.API_COST, 1.5);

      // Get all metrics
      const allMetrics = metrics.getAll();

      // Verify the values
      expect(allMetrics[MetricType.STORY_FETCHED]).toBe(5);
      expect(allMetrics[MetricType.CONTENT_EXTRACTED]).toBe(3);
      expect(allMetrics[MetricType.API_COST]).toBe(1.5);
    });
  });

  describe("reset", () => {
    it("should reset all metrics to 0", () => {
      // Set some metrics
      metrics.increment(MetricType.STORY_FETCHED, 5);
      metrics.increment(MetricType.CONTENT_EXTRACTED, 3);
      metrics.set(MetricType.API_COST, 1.5);

      // Reset metrics
      metrics.reset();

      // Verify all values are reset
      expect(metrics.get(MetricType.STORY_FETCHED)).toBe(0);
      expect(metrics.get(MetricType.CONTENT_EXTRACTED)).toBe(0);
      expect(metrics.get(MetricType.API_COST)).toBe(0);
    });
  });

  describe("trackAPIUsage", () => {
    it("should track tokens and calculate cost", () => {
      // Track API usage
      metrics.trackAPIUsage(1000, 500, "gemini-2.0-flash");

      // Verify tokens are tracked
      expect(metrics.get(MetricType.API_TOKENS_USED)).toBe(1500);

      // Verify cost is calculated
      expect(metrics.get(MetricType.API_COST)).toBeGreaterThan(0);
    });

    it("should calculate different costs for different models", () => {
      // Track usage for flash model
      metrics.trackAPIUsage(1000, 500, "gemini-2.0-flash");
      const flashCost = metrics.get(MetricType.API_COST);

      // Reset
      metrics.reset();

      // Track usage for pro model
      metrics.trackAPIUsage(1000, 500, "gemini-2.0-pro");
      const proCost = metrics.get(MetricType.API_COST);

      // Pro should be more expensive than flash
      expect(proCost).toBeGreaterThan(flashCost);
    });
  });

  describe("time", () => {
    it("should time a function execution", async () => {
      // Define a function that takes some time
      const slowFunction = async () => {
        return new Promise<string>((resolve) => {
          setTimeout(() => resolve("done"), 50);
        });
      };

      // Time the function
      const result = await metrics.time("slow_operation", slowFunction);

      // Verify the result is correct
      expect(result).toBe("done");

      // Verify the timing was recorded
      const allMetrics = metrics.getAll();
      expect(
        allMetrics[`${MetricType.LATENCY}_slow_operation`],
      ).toBeGreaterThanOrEqual(50);
    });

    it("should handle errors in timed functions", async () => {
      // Define a function that throws
      const errorFunction = async () => {
        throw new Error("Test error");
      };

      // Time the function and expect it to throw
      await expect(
        metrics.time("error_operation", errorFunction),
      ).rejects.toThrow("Test error");

      // Verify the timing was still recorded
      const allMetrics = metrics.getAll();
      expect(allMetrics[`${MetricType.LATENCY}_error_operation`]).toBeDefined();
    });
  });
});
