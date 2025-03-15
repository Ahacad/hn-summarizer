import { HackerNewsClient } from "../client";
import { MockHackerNewsAPI } from "../../../__mocks__/hackernews-api";

describe("HackerNewsClient", () => {
  let client: HackerNewsClient;

  beforeEach(() => {
    // Setup the mock API
    MockHackerNewsAPI.setupFetchMock();

    // Create a new client instance for each test
    client = new HackerNewsClient();
  });

  afterEach(() => {
    // Reset mocks
    MockHackerNewsAPI.resetFetchMock();
    jest.clearAllMocks();
  });

  describe("getTopStories", () => {
    it("should fetch top stories", async () => {
      // Call the method
      const stories = await client.getTopStories();

      // Verify the result
      expect(stories).toBeInstanceOf(Array);
      expect(stories.length).toBeGreaterThan(0);
      expect(typeof stories[0]).toBe("number");

      // Verify fetch was called
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/topstories.json"),
      );
    });

    it("should respect the limit parameter", async () => {
      // Call with limit of 5
      const stories = await client.getTopStories(5);

      // Verify only 5 stories are returned
      expect(stories.length).toBe(5);
    });

    it("should use cached results when available", async () => {
      // Call twice
      await client.getTopStories();
      await client.getTopStories();

      // Verify fetch was only called once
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("should handle errors gracefully", async () => {
      // Override the mock to simulate an error
      (fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: "Server Error",
        }),
      );

      // Expect the method to throw
      await expect(client.getTopStories()).rejects.toThrow();
    });
  });

  describe("getStory", () => {
    it("should fetch a story by ID", async () => {
      // Call the method
      const story = await client.getStory(30000001);

      // Verify the result
      expect(story).toBeDefined();
      expect(story.id).toBe(30000001);
      expect(story.type).toBe("story");

      // Verify fetch was called
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/item/30000001.json"),
      );
    });

    it("should handle errors gracefully", async () => {
      // Override the mock to simulate an error
      (fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: "Server Error",
        }),
      );

      // Expect the method to throw
      await expect(client.getStory(12345)).rejects.toThrow();
    });
  });

  describe("getStories", () => {
    it("should fetch multiple stories", async () => {
      // Call the method
      const ids = [30000001, 30000002, 30000003];
      const stories = await client.getStories(ids);

      // Verify the result
      expect(stories.length).toBe(3);
      expect(stories[0].id).toBe(30000001);
      expect(stories[1].id).toBe(30000002);
      expect(stories[2].id).toBe(30000003);

      // Verify fetch was called for each story
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it("should handle concurrency parameter", async () => {
      // Call with 10 IDs but concurrency of 2
      const ids = Array.from({ length: 10 }, (_, i) => 30000001 + i);
      await client.getStories(ids, 2);

      // Verify fetch was called for each story
      expect(fetch).toHaveBeenCalledTimes(10);
    });

    it("should continue even if some stories fail", async () => {
      // Override the mock to simulate an error for the second story
      (fetch as jest.Mock)
        .mockImplementationOnce((url) => {
          // First story succeeds
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(MockHackerNewsAPI.getStory(30000001)),
          });
        })
        .mockImplementationOnce((url) => {
          // Second story fails
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: "Server Error",
          });
        })
        .mockImplementationOnce((url) => {
          // Third story succeeds
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(MockHackerNewsAPI.getStory(30000003)),
          });
        });

      // Call the method
      const ids = [30000001, 30000002, 30000003];
      const stories = await client.getStories(ids, 1); // Force sequential processing

      // Verify we got 2 stories (the ones that succeeded)
      expect(stories.length).toBe(2);
      expect(stories[0].id).toBe(30000001);
      expect(stories[1].id).toBe(30000003);
    });
  });
});
