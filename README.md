# HackerNews Summarizer

A serverless application that automatically summarizes top HackerNews stories using LLMs and delivers the summaries through messaging platforms.

## Features

- 🔍 Fetches top stories from HackerNews API
- 📰 Extracts and cleans content from the linked articles
- 🤖 Generates concise summaries using Google AI (Gemini)
- 📱 Delivers summaries via Telegram and/or Discord
- ☁️ Runs entirely on Cloudflare Workers, D1, and R2

## Architecture

The application follows a serverless architecture with these components:

- **Data Collection Layer**: Fetches stories from HackerNews API and extracts content from web pages
- **Processing Layer**: Cleans content and generates summaries using LLMs
- **Storage Layer**: Stores metadata in D1 and content/summaries in R2
- **Notification Layer**: Delivers summaries to messaging platforms

## Prerequisites

- Node.js 16+
- Cloudflare account with Workers, D1, and R2 access
- Google AI API key for Gemini
- A self-hosted Firecrawl API endpoint for content extraction
- Telegram Bot token and/or Discord webhook URL (at least one is required for notifications)

## Setup

1. Clone the repository:

```bash
git clone https://github.com/yourusername/hn-summarizer.git
cd hn-summarizer
```

2. Install dependencies:

```bash
npm install
```

3. Copy the example configuration and update it with your settings:

```bash
cp wrangler.example.toml wrangler.toml
```

Then edit `wrangler.toml` and replace `<YOUR_DATABASE_ID>` with your actual database ID.

4. Create the D1 database:

```bash
wrangler d1 create hn-summarizer
```

5. Apply the database migrations:

```bash
wrangler d1 execute hn-summarizer --file=./migrations/001_initial_schema.sql
```

6. Create the R2 bucket:

```bash
wrangler r2 bucket create hn-summarizer-content
```

7. Add your secrets:

```bash
wrangler secret put GOOGLE_AI_API_KEY
wrangler secret put FIRECRAWL_API_URL
wrangler secret put TELEGRAM_BOT_TOKEN  # Optional
wrangler secret put DISCORD_WEBHOOK_URL  # Optional
wrangler secret put TELEGRAPH_ACCESS_TOKEN  # Optional, for publishing digests to Telegraph
```

8. Set up a Telegraph account (optional):

If you want to publish daily digests to Telegraph, you'll need to create an account:

```bash
# Create a Telegraph account
curl -X POST https://api.telegra.ph/createAccount \
  -H "Content-Type: application/json" \
  -d '{
    "short_name": "HackerNewsDigest",
    "author_name": "YourName"
  }'

# Save the access_token from the response and add it as a secret
wrangler secret put TELEGRAPH_ACCESS_TOKEN
```

## Development

Start the development server:

```bash
npm run dev
```

## Deployment

Deploy to Cloudflare Workers:

```bash
npm run publish
```

## Testing

Run the test suite:

```bash
npm test
```

Generate coverage report:

```bash
npm run test:coverage
```

## Project Structure

```
hn-summarizer/
├── src/                       # Source code
│   ├── api/                   # API routes
│   ├── config/                # Configuration
│   ├── services/              # Service layer
│   │   ├── hackernews/        # HackerNews API client
│   │   ├── content/           # Content extraction
│   │   ├── summarization/     # LLM summarization
│   │   └── notifications/     # Notification services
│   ├── storage/               # Data storage
│   │   ├── d1/                # D1 database
│   │   └── r2/                # R2 object storage
│   ├── types/                 # TypeScript type definitions
│   ├── utils/                 # Utility functions
│   └── workers/               # Worker handlers
├── migrations/                # Database migrations
└── wrangler.example.toml      # Example Cloudflare configuration
```

## How It Works

1. The system fetches top stories from HackerNews at regular intervals
2. For each story, it extracts and processes the content using Firecrawl
3. The processed content is then summarized using Google's Gemini AI
4. Summaries are delivered to configured notification channels
5. All operations run on scheduled Cloudflare Workers

## Future Enhancements

- Web UI for browsing summaries
- User preferences and custom sources
- Enhanced content extraction for complex sites
- Multi-LLM provider support
- Analytics and performance tracking

## License

see [LICENSE.md](./LICENSE.md)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
