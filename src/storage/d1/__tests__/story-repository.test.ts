import { StoryRepository } from "../story-repository";
import { ENV } from "../../../config/environment";
import { ProcessingStatus } from "../../../types/story";
import { MockD1Database } from "../../../__mocks__/cloudflare";

// Mock the ENV module
jest.mock("../../../config/environment", () => ({
  ENV: {
    get: jest.fn(),
  },
}));

describe("StoryRepository", () => {
  let repository: StoryRepository;
  let mockDb: MockD1Database;

  beforeEach(() => {
    // Setup mock database
    mockDb = new MockD1Database();

    // Mock ENV.get to return our mock database
    (ENV.get as jest.Mock).mockImplementation((key) => {
      if (key === "HN_SUMMARIZER_DB") return mockDb;
      return null;
    });

    // Create a new repository instance for each test
    repository = new StoryRepository();

    // Seed the database with some test data
    const now = new Date().toISOString();
    mockDb.seed("stories", [
      {
        id: 30000001,
        title: "Test Story 1",
        url: "https://example.com/1",
        by: "user1",
        time: 1645500000,
        score: 100,
        status: ProcessingStatus.PENDING,
        content_id: null,
        summary_id: null,
        processed_at: now,
        updated_at: now,
        error: null,
      },
      {
        id: 30000002,
        title: "Test Story 2",
        url: "https://example.com/2",
        by: "user2",
        time: 1645500100,
        score: 200,
        status: ProcessingStatus.EXTRACTED,
        content_id: "content/30000002/123456",
        summary_id: null,
        processed_at: now,
        updated_at: now,
        error: null,
      },
      {
        id: 30000003,
        title: "Test Story 3",
        url: "https://example.com/3",
        by: "user3",
        time: 1645500200,
        score: 300,
        status: ProcessingStatus.COMPLETED,
        content_id: "content/30000003/123456",
        summary_id: "summary/30000003/123456",
        processed_at: now,
        updated_at: now,
        error: null,
      },
    ]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("saveStory", () => {
    it("should insert a new story", async () => {
      const now = new Date().toISOString();
      const newStory = {
        id: 30000004,
        title: "New Story",
        url: "https://example.com/4",
        by: "user4",
        time: 1645500300,
        score: 400,
        status: ProcessingStatus.PENDING,
        processedAt: now,
        updatedAt: now,
      };

      const result = await repository.saveStory(newStory);

      expect(result).toBe(true);
    });

    it("should update an existing story", async () => {
      const now = new Date().toISOString();
      const updatedStory = {
        id: 30000001, // Existing ID
        title: "Updated Story",
        url: "https://example.com/updated",
        by: "user1",
        time: 1645500000,
        score: 150, // Updated score
        status: ProcessingStatus.EXTRACTING, // Updated status
        processedAt: now,
        updatedAt: now,
      };

      const result = await repository.saveStory(updatedStory);

      expect(result).toBe(true);
    });

    it("should handle errors gracefully", async () => {
      // Mock D1Database.prepare to throw
      jest.spyOn(mockDb, "prepare").mockImplementationOnce(() => {
        throw new Error("Database error");
      });

      const now = new Date().toISOString();
      const story = {
        id: 30000004,
        title: "New Story",
        url: "https://example.com/4",
        by: "user4",
        time: 1645500300,
        score: 400,
        status: ProcessingStatus.PENDING,
        processedAt: now,
        updatedAt: now,
      };

      const result = await repository.saveStory(story);

      expect(result).toBe(false);
    });
  });

  describe("getStory", () => {
    it("should retrieve a story by ID", async () => {
      const story = await repository.getStory(30000001);

      expect(story).not.toBeNull();
      expect(story?.id).toBe(30000001);
      expect(story?.title).toBe("Test Story 1");
    });

    it("should return null for non-existent stories", async () => {
      const story = await repository.getStory(99999);

      expect(story).toBeNull();
    });
  });

  describe("getStoriesByStatus", () => {
    it("should retrieve stories by status", async () => {
      const stories = await repository.getStoriesByStatus(
        ProcessingStatus.PENDING,
      );

      expect(stories).toBeInstanceOf(Array);
      expect(stories.length).toBeGreaterThan(0);
      expect(stories[0].status).toBe(ProcessingStatus.PENDING);
    });

    it("should respect the limit parameter", async () => {
      // Add more stories with the same status
      const now = new Date().toISOString();
      for (let i = 4; i <= 10; i++) {
        mockDb.seed("stories", [
          {
            id: 30000000 + i,
            title: `Test Story ${i}`,
            url: `https://example.com/${i}`,
            by: `user${i}`,
            time: 1645500000 + i,
            score: 100 + i,
            status: ProcessingStatus.PENDING,
            content_id: null,
            summary_id: null,
            processed_at: now,
            updated_at: now,
            error: null,
          },
        ]);
      }

      const stories = await repository.getStoriesByStatus(
        ProcessingStatus.PENDING,
        3,
      );

      expect(stories.length).toBe(3);
    });
  });

  describe("updateStatus", () => {
    it("should update story status", async () => {
      const result = await repository.updateStatus(
        30000001,
        ProcessingStatus.EXTRACTING,
      );

      expect(result).toBe(true);

      // Verify the status was updated
      const story = await repository.getStory(30000001);
      expect(story?.status).toBe(ProcessingStatus.EXTRACTING);
    });

    it("should handle error message", async () => {
      const result = await repository.updateStatus(
        30000001,
        ProcessingStatus.FAILED,
        "Test error message",
      );

      expect(result).toBe(true);
    });
  });

  describe("updateContentId", () => {
    it("should update content ID", async () => {
      const result = await repository.updateContentId(
        30000001,
        "content/30000001/123456",
      );

      expect(result).toBe(true);
    });
  });

  describe("updateSummaryId", () => {
    it("should update summary ID", async () => {
      const result = await repository.updateSummaryId(
        30000001,
        "summary/30000001/123456",
      );

      expect(result).toBe(true);
    });
  });

  describe("exists", () => {
    it("should return true for existing stories", async () => {
      const exists = await repository.exists(30000001);

      expect(exists).toBe(true);
    });

    it("should return false for non-existent stories", async () => {
      const exists = await repository.exists(99999);

      expect(exists).toBe(false);
    });
  });

  describe("getLatestStories", () => {
    it("should retrieve latest completed stories", async () => {
      const stories = await repository.getLatestStories();

      expect(stories).toBeInstanceOf(Array);
      // We only have one COMPLETED story in our seed data
      expect(stories.length).toBe(1);
      expect(stories[0].status).toBe(ProcessingStatus.COMPLETED);
    });

    it("should respect the limit parameter", async () => {
      // Add more completed stories
      const now = new Date().toISOString();
      for (let i = 4; i <= 10; i++) {
        mockDb.seed("stories", [
          {
            id: 30000000 + i,
            title: `Test Story ${i}`,
            url: `https://example.com/${i}`,
            by: `user${i}`,
            time: 1645500000 + i,
            score: 100 + i,
            status: ProcessingStatus.COMPLETED,
            content_id: `content/30000000${i}/123456`,
            summary_id: `summary/30000000${i}/123456`,
            processed_at: now,
            updated_at: now,
            error: null,
          },
        ]);
      }

      const stories = await repository.getLatestStories(3);

      expect(stories.length).toBe(3);
    });
  });
});
