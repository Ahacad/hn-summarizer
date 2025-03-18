// Mock Cloudflare Workers environment
global.Response = class Response {
  constructor(body, init = {}) {
    this.body = body;
    this.status = init.status || 200;
    this.statusText = init.statusText || '';
    this.headers = new Map(Object.entries(init.headers || {}));
    this.ok = this.status >= 200 && this.status < 300;
  }

  text() {
    return Promise.resolve(typeof this.body === 'string' ? this.body : JSON.stringify(this.body));
  }

  json() {
    return Promise.resolve(typeof this.body === 'string' ? JSON.parse(this.body) : this.body);
  }
};

global.Request = class Request {
  constructor(url, init = {}) {
    this.url = url;
    this.method = init.method || 'GET';
    this.headers = new Map(Object.entries(init.headers || {}));
    this.body = init.body || null;
  }

  text() {
    return Promise.resolve(typeof this.body === 'string' ? this.body : JSON.stringify(this.body));
  }

  json() {
    return Promise.resolve(typeof this.body === 'string' ? JSON.parse(this.body) : this.body);
  }
};

// Mock fetch
global.fetch = jest.fn();

// Mock ExecutionContext - Create a proper mock class instead of just declaring it
global.ExecutionContext = class ExecutionContext {
  constructor() {
    // Add any properties needed for tests
  }
  
  waitUntil(promise) {
    // Mock implementation
    return promise;
  }
  
  passThroughOnException() {
    // Mock implementation
  }
};

// Export a helper to create a mock context for tests
global.createMockExecutionContext = () => {
  return new ExecutionContext();
};

// Mock Cloudflare Workers environment variables
process.env.GOOGLE_AI_API_KEY = 'test-api-key';
process.env.TELEGRAM_BOT_TOKEN = 'test-telegram-token';
process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/test';
process.env.ENVIRONMENT = 'test';
process.env.LOG_LEVEL = 'error';
process.env.MAX_STORIES_PER_FETCH = '10';
process.env.SUMMARIZATION_MAX_TOKENS = '1000';

// Mock console methods to silence logs during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
