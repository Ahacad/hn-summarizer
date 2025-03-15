import { storyFetcherHandler } from '../story-fetcher';
import { HackerNewsClient } from '../../services/hackernews/client';
import { StoryRepository } from '../../storage/d1/story-repository';
import { ENV } from '../../config/environment';
import { logger } from '../../utils/logger';
import { ProcessingStatus } from '../../types/story';
import { MockHackerNewsAPI } from '../../__mocks__/hackernews-api';

// Mock dependencies
jest.mock('../../services/hackernews/client');
jest.mock('../../storage/d1/story-repository');
jest.mock('../../config/environment');
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn()
  }
}));

describe('Story Fetcher Worker', () => {
  let mockEnv: any;
  let mockCtx: ExecutionContext;
  
  // Mock implementations
  const mockGetTopStories = jest.fn();
  const mockGetStories = jest.fn();
  const mockExists = jest.fn();
  const mockSaveStory = jest.fn();
  
  beforeEach(() => {
    // Set up request environment
    mockEnv = { MAX_STORIES_PER_FETCH: 5 };
    mockCtx = new ExecutionContext();
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock HackerNewsClient implementation
    (HackerNewsClient as jest.Mock).mockImplementation(() => ({
      getTopStories: mockGetTopStories,
      getStories: mockGetStories
    }));
    
    // Mock StoryRepository implementation
    (StoryRepository as jest.Mock).mockImplementation(() => ({
      exists: mockExists,
      saveStory: mockSaveStory
    }));
    
    // Mock ENV.get
    (ENV.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'MAX_STORIES_PER_FETCH') return 5;
      return null;
    });
    
    // Set up HackerNews API mock data
    const storyIds = [1, 2, 3, 4, 5];
    const stories = storyIds.map(id => ({
      id,
      type: 'story',
      by: `user_${id}`,
      time: 1645500000 + id,
      title: `Test Story ${id}`,
      url: `https://example.com/article-${id}`,
      score: 100 + id,
      descendants: id
    }));
    
    // Set default mock return values
    mockGetTopStories.mockResolvedValue(storyIds);
    mockGetStories.mockResolvedValue(stories);
    mockExists.mockResolvedValue(false); // Default to not existing
    mockSaveStory.mockResolvedValue(true);
  });
  
  it('should fetch stories and save them to the database', async () => {
    // Create test request
    const request = new Request('https://example.com/cron/fetch-stories');
    
    // Call the handler
    const response = await storyFetcherHandler(request, mockEnv, mockCtx);
    
    // Verify correct functions were called
    expect(HackerNewsClient).toHaveBeenCalled();
    expect(StoryRepository).toHaveBeenCalled();
    
    // Verify stories were fetched
    expect(mockGetTopStories).toHaveBeenCalledWith(5); // From env
    expect(mockGetStories).toHaveBeenCalled();
    
    // Verify each story existence was checked and saved
    expect(mockExists).toHaveBeenCalledTimes(5);
    expect(mockSaveStory).toHaveBeenCalledTimes(5);
    
    // Verify response
    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect(responseBody.success).toBe(true);
    expect(responseBody.new).toBe(5); // All stories are new
  });
  
  it('should update existing stories', async () => {
    // Set the first 2 stories to already exist
    mockExists
      .mockImplementation((id: number) => Promise.resolve(id <= 2));
    
    // Create test request
    const request = new Request('https://example.com/cron/fetch-stories');
    
    // Call the handler
    const response = await storyFetcherHandler(request, mockEnv, mockCtx);
    
    // Verify response
    const responseBody = await response.json();
    expect(responseBody.success).toBe(true);
    expect(responseBody.new).toBe(3); // 3 new stories
    expect(responseBody.updated).toBe(2); // 2 updated stories
  });
  
  it('should skip non-story items and items without URLs', async () => {
    // Mock getStories to return mix of stories and non-stories
    mockGetStories.mockResolvedValue([
      {
        id: 1,
        type: 'story',
        by: 'user_1',
        time: 1645500001,
        title: 'Test Story 1',
        url: 'https://example.com/article-1',
        score: 101,
        descendants: 1
      },
      {
        id: 2,
        type: 'comment', // Not a story
        by: 'user_2',
        time: 1645500002,
        text: 'This is a comment',
        parent: 1
      },
      {
        id: 3,
        type: 'story',
        by: 'user_3',
        time: 1645500003,
        title: 'Test Story 3 (no URL)', // No URL (text post)
        text: 'This is a text post',
        score: 103,
        descendants: 3
      }
    ]);
    
    // Create test request
    const request = new Request('https://example.com/cron/fetch-stories');
    
    // Call the handler
    const response = await storyFetcherHandler(request, mockEnv, mockCtx);
    
    // Verify response
    expect(response.status).toBe(200);
    
    // Should only have processed the first story
    expect(mockSaveStory).toHaveBeenCalledTimes(1);
  });
  
  it('should handle errors gracefully', async () => {
    // Make getTopStories throw an error
    mockGetTopStories.mockRejectedValue(new Error('API error'));
    
    // Create test request
    const request = new Request('https://example.com/cron/fetch-stories');
    
    // Call the handler
    const response = await storyFetcherHandler(request, mockEnv, mockCtx);
    
    // Verify error was logged
    expect(logger.error).toHaveBeenCalledWith(
      'Error in story fetcher worker',
      expect.objectContaining({ error: expect.any(Error) })
    );
    
    // Verify error response
    expect(response.status).toBe(500);
    const responseBody = await response.json();
    expect(responseBody.success).toBe(false);
    expect(responseBody.error).toBe('API error');
  });
});
