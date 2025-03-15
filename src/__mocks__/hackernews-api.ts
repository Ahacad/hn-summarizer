/**
 * Mock HackerNews API responses
 */
import { HNStory, HNStoryID } from "../types/hackernews";

/**
 * Mock HackerNews API responses for testing
 */
export class MockHackerNewsAPI {
  /**
   * Get mock top story IDs
   */
  static getTopStoryIds(count = 10): HNStoryID[] {
    return Array.from({ length: count }, (_, index) => 30000000 + index);
  }

  /**
   * Get a mock story by ID
   */
  static getStory(id: HNStoryID): HNStory {
    return {
      id,
      deleted: false,
      type: "story",
      by: `user_${id % 1000}`,
      time: Math.floor(Date.now() / 1000) - (id % 100000),
      text: null,
      dead: false,
      kids: [],
      url: `https://example.com/article-${id}`,
      score: 100 + (id % 900),
      title: `Test Story ${id}`,
      descendants: id % 100,
    };
  }

  /**
   * Get multiple mock stories
   */
  static getStories(ids: HNStoryID[]): HNStory[] {
    return ids.map((id) => this.getStory(id));
  }

  /**
   * Setup fetch mock for HackerNews API
   */
  static setupFetchMock() {
    // Mock the global fetch for HackerNews API calls
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/topstories.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(this.getTopStoryIds(30)),
        });
      } else if (url.includes("/item/")) {
        // Extract ID from URL
        const idMatch = url.match(/\/item\/(\d+)\.json/);
        if (idMatch) {
          const id = parseInt(idMatch[1], 10);
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(this.getStory(id)),
          });
        }
      }

      // Default response for unknown URLs
      return Promise.resolve({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });
    });
  }

  /**
   * Reset fetch mock
   */
  static resetFetchMock() {
    (global.fetch as jest.Mock).mockReset();
  }
}
