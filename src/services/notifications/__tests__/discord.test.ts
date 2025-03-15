import { DiscordNotifier } from '../discord';
import { ENV } from '../../../config/environment';
import { logger } from '../../../utils/logger';

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
    error: jest.fn()
  }
}));

// Mock discord.js
jest.mock('discord.js', () => {
  const mockSend = jest.fn().mockResolvedValue({});
  
  return {
    WebhookClient: jest.fn().mockImplementation(() => ({
      send: mockSend
    })),
    EmbedBuilder: jest.fn().mockImplementation(() => ({
      setColor: jest.fn().mockReturnThis(),
      setTitle: jest.fn().mockReturnThis(),
      setURL: jest.fn().mockReturnThis(),
      setDescription: jest.fn().mockReturnThis(),
      addFields: jest.fn().mockReturnThis(),
      setTimestamp: jest.fn().mockReturnThis(),
      setFooter: jest.fn().mockReturnThis()
    })),
    Colors: {
      Blue: 0x0000FF
    }
  };
});

describe('DiscordNotifier', () => {
  let notifier: DiscordNotifier;
  
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
    it('should initialize with provided webhook URL', () => {
      notifier = new DiscordNotifier('https://discord.com/api/webhooks/test');
      
      expect(notifier.isConfigured()).toBe(true);
    });
    
    it('should use webhook URL from environment if not provided', () => {
      // Mock ENV.get to return a webhook URL
      (ENV.get as jest.Mock).mockImplementation((key) => {
        if (key === 'DISCORD_WEBHOOK_URL') {
          return 'https://discord.com/api/webhooks/env-test';
        }
        return null;
      });
      
      notifier = new DiscordNotifier();
      
      expect(ENV.get).toHaveBeenCalledWith('DISCORD_WEBHOOK_URL');
      expect(notifier.isConfigured()).toBe(true);
    });
    
    it('should handle missing webhook URL', () => {
      // Mock ENV.get to return null
      (ENV.get as jest.Mock).mockReturnValue(null);
      
      notifier = new DiscordNotifier();
      
      expect(notifier.isConfigured()).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith('Discord webhook URL not configured');
    });
  });
  
  describe('isConfigured', () => {
    it('should return true when webhook client is initialized', () => {
      notifier = new DiscordNotifier('https://discord.com/api/webhooks/test');
      
      expect(notifier.isConfigured()).toBe(true);
    });
    
    it('should return false when webhook client is not initialized', () => {
      // Mock ENV.get to return null
      (ENV.get as jest.Mock).mockReturnValue(null);
      
      notifier = new DiscordNotifier();
      
      expect(notifier.isConfigured()).toBe(false);
    });
  });
  
  describe('sendSummary', () => {
    beforeEach(() => {
      // Initialize with a webhook URL
      notifier = new DiscordNotifier('https://discord.com/api/webhooks/test');
    });
    
    it('should send a summary successfully', async () => {
      const result = await notifier.sendSummary(mockStory, mockSummary);
      
      // Verify the result
      expect(result).toBe(true);
      
      // Verify send was called
      const { WebhookClient } = require('discord.js');
      const mockClient = WebhookClient.mock.results[0].value;
      expect(mockClient.send).toHaveBeenCalled();
      
      // Verify the log
      expect(logger.info).toHaveBeenCalledWith(
        'Summary sent to Discord',
        expect.objectContaining({ storyId: 12345 })
      );
    });
    
    it('should return false if not configured', async () => {
      // Create an unconfigured notifier
      (ENV.get as jest.Mock).mockReturnValue(null);
      const unconfiguredNotifier = new DiscordNotifier();
      
      const result = await unconfiguredNotifier.sendSummary(mockStory, mockSummary);
      
      // Verify the result
      expect(result).toBe(false);
      
      // Verify the log
      expect(logger.warn).toHaveBeenCalledWith('Discord notifier not properly configured');
    });
    
    it('should handle send errors gracefully', async () => {
      // Make send throw an error
      const { WebhookClient } = require('discord.js');
      const mockClient = WebhookClient.mock.results[0].value;
      mockClient.send.mockRejectedValueOnce(new Error('Discord API error'));
      
      const result = await notifier.sendSummary(mockStory, mockSummary);
      
      // Verify the result
      expect(result).toBe(false);
      
      // Verify the log
      expect(logger.error).toHaveBeenCalledWith(
        'Error sending summary to Discord',
        expect.objectContaining({ 
          error: expect.any(Error),
          storyId: 12345
        })
      );
    });
  });
  
  describe('createEmbed', () => {
    beforeEach(() => {
      notifier = new DiscordNotifier('https://discord.com/api/webhooks/test');
    });
    
    it('should create an embed with all summary data', () => {
      // Get the private method using any type
      const createEmbed = (notifier as any).createEmbed.bind(notifier);
      
      // Call the method
      createEmbed(mockStory, mockSummary);
      
      // Get EmbedBuilder instance
      const { EmbedBuilder } = require('discord.js');
      const embedInstance = EmbedBuilder.mock.results[0].value;
      
      // Verify embed configuration
      expect(embedInstance.setColor).toHaveBeenCalled();
      expect(embedInstance.setTitle).toHaveBeenCalledWith('Test Story');
      expect(embedInstance.setURL).toHaveBeenCalledWith('https://example.com/article');
      expect(embedInstance.setDescription).toHaveBeenCalledWith('This is a short summary.');
      expect(embedInstance.addFields).toHaveBeenCalledTimes(4); // Summary, key points, topics, reading time
      expect(embedInstance.setFooter).toHaveBeenCalled();
    });
    
    it('should handle missing URL', () => {
      // Get the private method using any type
      const createEmbed = (notifier as any).createEmbed.bind(notifier);
      
      // Create story with no URL
      const storyWithoutUrl = { ...mockStory, url: undefined };
      
      // Call the method
      createEmbed(storyWithoutUrl, mockSummary);
      
      // Get EmbedBuilder instance
      const { EmbedBuilder } = require('discord.js');
      const embedInstance = EmbedBuilder.mock.results[0].value;
      
      // Verify setURL was not called
      expect(embedInstance.setURL).not.toHaveBeenCalled();
    });
    
    it('should handle missing short summary', () => {
      // Get the private method using any type
      const createEmbed = (notifier as any).createEmbed.bind(notifier);
      
      // Create summary with no short summary
      const summaryWithoutShort = { ...mockSummary, shortSummary: undefined };
      
      // Call the method
      createEmbed(mockStory, summaryWithoutShort);
      
      // Get EmbedBuilder instance
      const { EmbedBuilder } = require('discord.js');
      const embedInstance = EmbedBuilder.mock.results[0].value;
      
      // Verify description is truncated from main summary
      expect(embedInstance.setDescription).toHaveBeenCalledWith(
        expect.stringContaining('This is the full summary')
      );
    });
  });
  
  describe('truncateText', () => {
    beforeEach(() => {
      notifier = new DiscordNotifier('https://discord.com/api/webhooks/test');
    });
    
    it('should truncate text that exceeds max length', () => {
      // Get the private method using any type
      const truncateText = (notifier as any).truncateText.bind(notifier);
      
      // Create a long text
      const longText = 'a'.repeat(100);
      
      // Truncate to 50 characters
      const result = truncateText(longText, 50);
      
      // Verify result
      expect(result.length).toBeLessThanOrEqual(50);
      expect(result.endsWith('...')).toBe(true);
    });
    
    it('should not truncate text within max length', () => {
      // Get the private method using any type
      const truncateText = (notifier as any).truncateText.bind(notifier);
      
      // Create a short text
      const shortText = 'This is a short text';
      
      // Truncate to 50 characters
      const result = truncateText(shortText, 50);
      
      // Verify result is unchanged
      expect(result).toBe(shortText);
    });
    
    it('should truncate at word boundaries when possible', () => {
      // Get the private method using any type
      const truncateText = (notifier as any).truncateText.bind(notifier);
      
      // Create text with spaces
      const text = 'This is a text with multiple words and spaces';
      
      // Truncate to 20 characters
      const result = truncateText(text, 20);
      
      // Should truncate at a space
      expect(result).toBe('This is a text...');
    });
  });
});
