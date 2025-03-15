import { notificationSenderHandler } from '../notification-sender';
import { StoryRepository } from '../../storage/d1/story-repository';
import { ContentRepository } from '../../storage/r2/content-repository';
import { TelegramNotifier } from '../../services/notifications/telegram';
import { DiscordNotifier } from '../../services/notifications/discord';
import { HackerNewsClient } from '../../services/hackernews/client';
import { ProcessingStatus } from '../../types/story';
import { logger } from '../../utils/logger';

// Mock dependencies
jest.mock('../../storage/d1/story-repository');
jest.mock('../../storage/r2/content-repository');
jest.mock('../../services/notifications/telegram');
jest.mock('../../services/notifications/discord');
jest.mock('../../services/hackernews/client');
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('Notification Sender Worker', () => {
  // Mock implementations
  const mockGetStoriesByStatus = jest.fn();
  const mockGetSummary = jest.fn();
  const mockGetStory = jest.fn();
  const mockTelegramIsConfigured = jest.fn();
  const mockTelegramSendSummary = jest.fn();
  const mockDiscordIsConfigured = jest.fn();
  const mockDiscordSendSummary = jest.fn();
  
  // Test data
  const mockStories = [
    {
      id: 1,
      title: 'Test Story 1',
      url: 'https://example.com/article-1',
      by: 'user1',
      time: 1645500001,
      score: 101,
      status: ProcessingStatus.COMPLETED,
      contentId: 'content/1/123456',
      summaryId: 'summary/1/123456',
      processedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 2,
      title: 'Test Story 2',
      url: 'https://example.com/article-2',
      by: 'user2',
      time: 1645500002,
      score: 102,
      status: ProcessingStatus.COMPLETED,
      contentId: 'content/2/123456',
      summaryId: 'summary/2/123456',
      processedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 3,
      title: 'Test Story 3 (No Summary ID)',
      url: 'https://example.com/article-3',
      by: 'user3',
      time: 1645500003,
      score: 103,
      status: ProcessingStatus.COMPLETED,
      contentId: 'content/3/123456',
      summaryId: null, // No summary ID
      processedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];
  
  const mockSummary = {
    storyId: 1,
    summary: 'This is a summary of the article.',
    shortSummary: 'Short summary.',
    keyPoints: ['Point 1', 'Point 2'],
    topics: ['Technology', 'Science'],
    estimatedReadingTime: 2,
    model: 'gemini-2.0-flash',
    inputTokens: 200,
    outputTokens: 100,
    generatedAt: new Date().toISOString()
  };
  
  const mockHnStory = {
    id: 1,
    type: 'story',
    by: 'user1',
    time: 1645500001,
    title: 'Test Story 1',
    url: 'https://example.com/article-1',
    score: 101,
    descendants: 10
  };
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Set up StoryRepository mock
    (StoryRepository as jest.Mock).mockImplementation(() => ({
      getStoriesByStatus: mockGetStoriesByStatus
    }));
    
    // Set up ContentRepository mock
    (ContentRepository as jest.Mock).mockImplementation(() => ({
      getSummary: mockGetSummary
    }));
    
    // Set up TelegramNotifier mock
    (TelegramNotifier as jest.Mock).mockImplementation(() => ({
      isConfigured: mockTelegramIsConfigured,
      sendSummary: mockTelegramSendSummary
    }));
    
    // Set up DiscordNotifier mock
    (DiscordNotifier as jest.Mock).mockImplementation(() => ({
      isConfigured: mockDiscordIsConfigured,
      sendSummary: mockDiscordSendSummary
    }));
    
    // Set up HackerNewsClient mock
    (HackerNewsClient as jest.Mock).mockImplementation(() => ({
      getStory: mockGetStory
    }));
    
    // Set default mock return values
    mockGetStoriesByStatus.mockResolvedValue(mockStories);
    mockGetSummary.mockResolvedValue(mockSummary);
    mockGetStory.mockResolvedValue(mockHnStory);
    mockTelegramIsConfigured.mockReturnValue(true);
    mockTelegramSendSummary.mockResolvedValue(true);
    mockDiscordIsConfigured.mockReturnValue(true);
    mockDiscordSendSummary.mockResolvedValue(true);
  });
  
  it('should send notifications for completed stories', async () => {
    // Create test request
    const request = new Request('https://example.com/cron/send-notifications');
    
    // Call the handler
    const response = await notificationSenderHandler(request, {}, new ExecutionContext());
    
    // Verify correct initialization
    expect(StoryRepository).toHaveBeenCalled();
    expect(ContentRepository).toHaveBeenCalled();
    expect(TelegramNotifier).toHaveBeenCalled();
    expect(DiscordNotifier).toHaveBeenCalled();
    
    // Verify stories were fetched
    expect(mockGetStoriesByStatus).toHaveBeenCalledWith(ProcessingStatus.COMPLETED, 5);
    
    // Verify summaries were fetched
    expect(mockGetSummary).toHaveBeenCalledWith('summary/1/123456');
    expect(mockGetSummary).toHaveBeenCalledWith('summary/2/123456');
    
    // Verify notifications were sent
    expect(mockTelegramSendSummary).toHaveBeenCalledTimes(2);
    expect(mockDiscordSendSummary).toHaveBeenCalledTimes(2);
    
    // Verify response
    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect(responseBody.success).toBe(true);
    expect(responseBody.results.telegram.sent).toBe(2);
    expect(responseBody.results.discord.sent).toBe(2);
  });
  
  it('should handle missing summary ID', async () => {
    // Create test request
    const request = new Request('https://example.com/cron/send-notifications');
    
    // Call the handler
    const response = await notificationSenderHandler(request, {}, new ExecutionContext());
    
    // Verify story with missing summaryId was skipped
    expect(mockGetSummary).not.toHaveBeenCalledWith(null);
    
    // Verify response counts
    const responseBody = await response.json();
    expect(responseBody.results.telegram.skipped).toBeGreaterThan(0);
    expect(responseBody.results.discord.skipped).toBeGreaterThan(0);
  });
  
  it('should handle summary retrieval failures', async () => {
    // Make summary retrieval fail for the second story
    mockGetSummary
      .mockResolvedValueOnce(mockSummary) // First story succeeds
      .mockResolvedValueOnce(null); // Second story fails
    
    // Create test request
    const request = new Request('https://example.com/cron/send-notifications');
    
    // Call the handler
    const response = await notificationSenderHandler(request, {}, new ExecutionContext());
    
    // Verify only one notification was sent for each channel
    expect(mockTelegramSendSummary).toHaveBeenCalledTimes(1);
    expect(mockDiscordSendSummary).toHaveBeenCalledTimes(1);
    
    // Verify response
    const responseBody = await response.json();
    expect(responseBody.results.telegram.skipped).toBe(2); // Story 2 and Story 3
    expect(responseBody.results.discord.skipped).toBe(2);
  });
  
  it('should handle unconfigured notification channels', async () => {
    // Make both channels unconfigured
    mockTelegramIsConfigured.mockReturnValue(false);
    mockDiscordIsConfigured.mockReturnValue(false);
    
    // Create test request
    const request = new Request('https://example.com/cron/send-notifications');
    
    // Call the handler
    const response = await notificationSenderHandler(request, {}, new ExecutionContext());
    
    // Verify no notifications were sent
    expect(mockTelegramSendSummary).not.toHaveBeenCalled();
    expect(mockDiscordSendSummary).not.toHaveBeenCalled();
    
    // Verify response
    const responseBody = await response.json();
    expect(responseBody.results.telegram.skipped).toBe(3); // All stories skipped
    expect(responseBody.results.discord.skipped).toBe(3);
  });
  
  it('should handle notification sending failures', async () => {
    // Make sending fail for both channels on the second story
    mockTelegramSendSummary
      .mockResolvedValueOnce(true) // First story succeeds
      .mockResolvedValueOnce(false); // Second story fails
    
    mockDiscordSendSummary
      .mockResolvedValueOnce(true) // First story succeeds
      .mockResolvedValueOnce(false); // Second story fails
    
    // Create test request
    const request = new Request('https://example.com/cron/send-notifications');
    
    // Call the handler
    const response = await notificationSenderHandler(request, {}, new ExecutionContext());
    
    // Verify response
    const responseBody = await response.json();
    expect(responseBody.results.telegram.sent).toBe(1);
    expect(responseBody.results.telegram.failed).toBe(1);
    expect(responseBody.results.discord.sent).toBe(1);
    expect(responseBody.results.discord.failed).toBe(1);
  });
  
  it('should handle channel-specific errors', async () => {
    // Make Telegram throw an error
    mockTelegramSendSummary.mockImplementation(() => {
      throw new Error('Telegram API error');
    });
    
    // Create test request
    const request = new Request('https://example.com/cron/send-notifications');
    
    // Call the handler
    const response = await notificationSenderHandler(request, {}, new ExecutionContext());
    
    // Verify error logging
    expect(logger.error).toHaveBeenCalledWith('Error sending to Telegram', expect.any(Object));
    
    // Verify Discord still works
    expect(mockDiscordSendSummary).toHaveBeenCalled();
    
    // Verify response
    const responseBody = await response.json();
    expect(responseBody.results.telegram.failed).toBe(2);
    expect(responseBody.results.discord.sent).toBe(2);
  });
  
  it('should handle worker-level errors', async () => {
    // Make the repository throw an error
    mockGetStoriesByStatus.mockRejectedValueOnce(new Error('Database error'));
    
    // Create test request
    const request = new Request('https://example.com/cron/send-notifications');
    
    // Call the handler
    const response = await notificationSenderHandler(request, {}, new ExecutionContext());
    
    // Verify error logging
    expect(logger.error).toHaveBeenCalledWith('Error in notification sender worker', expect.any(Object));
    
    // Verify error response
    expect(response.status).toBe(500);
    const responseBody = await response.json();
    expect(responseBody.success).toBe(false);
    expect(responseBody.error).toBe('Database error');
  });
});
