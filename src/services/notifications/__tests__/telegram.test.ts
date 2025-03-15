import { TelegramNotifier } from '../telegram';
import { ENV } from '../../../config/environment';
import { logger } from '../../../utils/logger';
import { SummaryFormat } from '../../../types/summary';

// Mock dependencies
jest.mock('../../../config/environment', () => ({
  ENV: {
    get: jest.fn()
  }
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock telegraf
jest.mock('telegraf', () => {
  const mockSendMessage = jest.fn().mockResolvedValue({});
  
  return {
    Telegraf: jest.fn().mockImplementation(() => ({
      telegram: {
        sendMessage: mockSendMessage
      }
    }))
  };
});

describe('TelegramNotifier', () => {
  let notifier: TelegramNotifier;
  
  // Test data
  const mockStory = {
    id: 12345,
    type: 'story',
    by: 'testuser',
    time: 1645500000,
    title: 'Test Story',
    url: 'https://example.com/article',
    score: 100,
    descendants: 10
  };
  
  const mockSummary = {
    storyId: 12345,
    summary: 'This is the full summary of the article.',
    shortSummary: 'This is a short summary.',
    keyPoints: ['Point 1', 'Point 2', 'Point 3'],
    topics: ['Technology', 'Science'],
    estimatedReadingTime: 3,
    model: 'gemini-2.0-flash',
    inputTokens: 500,
    outputTokens: 200,
    generatedAt: new Date().toISOString()
  };
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('constructor', () => {
    it('should initialize with provided token and chat ID', () => {
      notifier = new TelegramNotifier('test-token', 'test-chat-id');
      
      expect(notifier.isConfigured()).toBe(true);
    });
    
    it('should use token from environment if not provided', () => {
      // Mock ENV.get to return a token
      (ENV.get as jest.Mock).mockImplementation((key) => {
        if (key === 'TELEGRAM_BOT_TOKEN') {
          return 'env-test-token';
        }
        return null;
      });
      
      notifier = new TelegramNotifier();
      
      expect(ENV.get).toHaveBeenCalledWith('TELEGRAM_BOT_TOKEN');
      expect(notifier.isConfigured()).toBe(false); // Still needs chat ID
    });
    
    it('should handle missing token', () => {
      // Mock ENV.get to return null
      (ENV.get as jest.Mock).mockReturnValue(null);
      
      notifier = new TelegramNotifier();
      
      expect(notifier.isConfigured()).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith('Telegram bot token not configured');
    });
  });
  
  describe('isConfigured', () => {
    it('should return true when bot and chat ID are initialized', () => {
      notifier = new TelegramNotifier('test-token', 'test-chat-id');
      
      expect(notifier.isConfigured()).toBe(true);
    });
    
    it('should return false when bot is missing', () => {
      // Mock ENV.get to return null
      (ENV.get as jest.Mock).mockReturnValue(null);
      
      notifier = new TelegramNotifier();
      
      expect(notifier.isConfigured()).toBe(false);
    });
    
    it('should return false when chat ID is missing', () => {
      // Mock ENV.get to return a token
      (ENV.get as jest.Mock).mockImplementation((key) => {
        if (key === 'TELEGRAM_BOT_TOKEN') {
          return 'test-token';
        }
        return null;
      });
      
      notifier = new TelegramNotifier();
      
      expect(notifier.isConfigured()).toBe(false);
    });
  });
  
  describe('sendSummary', () => {
    beforeEach(() => {
      // Initialize with token and chat ID
      notifier = new TelegramNotifier('test-token', 'test-chat-id');
      
      // Mock process.env for chat ID
      process.env.TELEGRAM_CHAT_ID = 'test-chat-id';
    });
    
    afterEach(() => {
      // Clean up
      delete process.env.TELEGRAM_CHAT_ID;
    });
    
    it('should send a summary successfully', async () => {
      const result = await notifier.sendSummary(mockStory, mockSummary);
      
      // Verify the result
      expect(result).toBe(true);
      
      // Verify sendMessage was called
      const { Telegraf } = require('telegraf');
      const mockBot = Telegraf.mock.results[0].value;
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        'test-chat-id',
        expect.any(String),
        expect.objectContaining({
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: false
        })
      );
      
      // Verify the log
      expect(logger.info).toHaveBeenCalledWith(
        'Summary sent to Telegram',
        expect.objectContaining({ 
          storyId: 12345,
          chatId: 'test-chat-id'
        })
      );
    });
    
    it('should return false if not configured', async () => {
      // Create an unconfigured notifier
      const unconfiguredNotifier = new TelegramNotifier();
      
      const result = await unconfiguredNotifier.sendSummary(mockStory, mockSummary);
      
      // Verify the result
      expect(result).toBe(false);
      
      // Verify the log
      expect(logger.warn).toHaveBeenCalledWith('Telegram notifier not properly configured');
    });
    
    it('should handle send errors gracefully', async () => {
      // Make sendMessage throw an error
      const { Telegraf } = require('telegraf');
      const mockBot = Telegraf.mock.results[0].value;
      mockBot.telegram.sendMessage.mockRejectedValueOnce(new Error('Telegram API error'));
      
      const result = await notifier.sendSummary(mockStory, mockSummary);
      
      // Verify the result
      expect(result).toBe(false);
      
      // Verify the log
      expect(logger.error).toHaveBeenCalledWith(
        'Error sending summary to Telegram',
        expect.objectContaining({ 
          error: expect.any(Error),
          storyId: 12345
        })
      );
    });
    
    it('should use provided chat ID if specified', async () => {
      const customChatId = 'custom-chat-id';
      
      await notifier.sendSummary(mockStory, mockSummary, customChatId);
      
      // Verify sendMessage was called with custom chat ID
      const { Telegraf } = require('telegraf');
      const mockBot = Telegraf.mock.results[0].value;
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        customChatId,
        expect.any(String),
        expect.any(Object)
      );
    });
    
    it('should fall back to environment chat ID if available', async () => {
      // Create notifier without chat ID
      const noIdNotifier = new TelegramNotifier('test-token');
      
      await noIdNotifier.sendSummary(mockStory, mockSummary);
      
      // Verify sendMessage was called with environment chat ID
      const { Telegraf } = require('telegraf');
      const mockBot = Telegraf.mock.results[0].value;
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        'test-chat-id', // From process.env
        expect.any(String),
        expect.any(Object)
      );
    });
    
    it('should handle missing chat ID', async () => {
      // Create notifier without chat ID
      const noIdNotifier = new TelegramNotifier('test-token');
      
      // Remove environment chat ID
      delete process.env.TELEGRAM_CHAT_ID;
      
      const result = await noIdNotifier.sendSummary(mockStory, mockSummary);
      
      // Verify the result
      expect(result).toBe(false);
      
      // Verify the log
      expect(logger.warn).toHaveBeenCalledWith('No Telegram chat ID configured');
    });
  });
  
  describe('formatSummary', () => {
    beforeEach(() => {
      notifier = new TelegramNotifier('test-token', 'test-chat-id');
    });
    
    it('should format as plain text when requested', () => {
      // Get the private method using any type
      const formatSummary = (notifier as any).formatSummary.bind(notifier);
      
      // Call the method with TEXT format
      const result = formatSummary(mockStory, mockSummary, SummaryFormat.TEXT);
      
      // Verify result is a string
      expect(typeof result).toBe('string');
      
      // Verify it includes key elements
      expect(result).toContain('Test Story');
      expect(result).toContain('This is a short summary');
      expect(result).toContain('This is the full summary');
      expect(result).toContain('Key Points:');
      expect(result).toContain('Point 1');
      expect(result).toContain('3 min read');
      expect(result).toContain('https://example.com/article');
      expect(result).toContain('https://news.ycombinator.com/item?id=12345');
    });
    
    it('should format as markdown when requested', () => {
      // Get the private method using any type
      const formatSummary = (notifier as any).formatSummary.bind(notifier);
      
      // Call the method with MARKDOWN format
      const result = formatSummary(mockStory, mockSummary, SummaryFormat.MARKDOWN);
      
      // Verify result is a string
      expect(typeof result).toBe('string');
      
      // Verify it includes key elements with markdown formatting
      expect(result).toContain('*📰');
      expect(result).toContain('_This is a short summary');
      expect(result).toContain('*Key Points:*');
    });
    
    it('should handle missing story URL', () => {
      // Get the private method using any type
      const formatSummary = (notifier as any).formatSummary.bind(notifier);
      
      // Create story with no URL
      const storyWithoutUrl = { ...mockStory, url: undefined };
      
      // Call the method
      const result = formatSummary(storyWithoutUrl, mockSummary, SummaryFormat.TEXT);
      
      // Verify it doesn't include the original article link
      expect(result).not.toContain('Original: ');
      // But still includes HN link
      expect(result).toContain('https://news.ycombinator.com/item?id=12345');
    });
    
    it('should handle missing short summary', () => {
      // Get the private method using any type
      const formatSummary = (notifier as any).formatSummary.bind(notifier);
      
      // Create summary with no short summary
      const summaryWithoutShort = { ...mockSummary, shortSummary: undefined };
      
      // Call the method
      const result = formatSummary(mockStory, summaryWithoutShort, SummaryFormat.TEXT);
      
      // Verify it still contains the main summary
      expect(result).toContain('This is the full summary');
    });
    
    it('should handle missing key points', () => {
      // Get the private method using any type
      const formatSummary = (notifier as any).formatSummary.bind(notifier);
      
      // Create summary with no key points
      const summaryWithoutPoints = { ...mockSummary, keyPoints: undefined };
      
      // Call the method
      const result = formatSummary(mockStory, summaryWithoutPoints, SummaryFormat.TEXT);
      
      // Verify it doesn't include key points section
      expect(result).not.toContain('Key Points:');
    });
    
    it('should properly escape markdown characters', () => {
      // Get the private method using any type
      const formatMarkdown = (notifier as any).formatMarkdown.bind(notifier);
      
      // Create story and summary with markdown characters
      const storyWithMarkdown = { 
        ...mockStory,
        title: 'Test *Story* with [markdown]'
      };
      
      const summaryWithMarkdown = {
        ...mockSummary,
        summary: 'Summary with *bold* and _italic_ and [link](https://example.com)'
      };
      
      // Call the method
      const result = formatMarkdown(storyWithMarkdown, summaryWithMarkdown);
      
      // Verify markdown characters are escaped
      expect(result).toContain('Test \\*Story\\* with \\[markdown\\]');
      expect(result).toContain('Summary with \\*bold\\* and \\_italic\\_ and \\[link\\]\\(https://example\\.com\\)');
    });
  });
});
