# HackerNews Summarizer

A serverless application that automatically summarizes top HackerNews stories using LLMs and delivers the summaries through messaging platforms.

## Features

- 🔍 Fetches top stories from HackerNews API
- 📰 Extracts and cleans content from the linked articles
- 🤖 Generates concise summaries using Google AI
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
- Google AI API key
- Telegram Bot token and/or Discord webhook URL

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

3. Create the D1 database:

```bash
wrangler d1 create hn-summarizer
```

4. Apply the database migrations:

```bash
wrangler d1 execute hn-summarizer --file=./migrations/001_initial_schema.sql
```

5. Create the R2 bucket:

```bash
wrangler r2 bucket create hn-summarizer-content
```

6. Update `wrangler.toml` with your database ID and bucket name.

7. Add your secrets:

```bash
wrangler secret put GOOGLE_AI_API_KEY
wrangler secret put TELEGRAM_BOT_TOKEN  # Optional
wrangler secret put DISCORD_WEBHOOK_URL  # Optional
```

## Development

Start the development server:

```bash
npm run dev
```

## Deployment

Deploy to Cloudflare Workers:

```bash
npm run deploy
```

## Testing

Run the test suite:

```bash
npm test
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
└── migrations/                # Database migrations
```

## Future Enhancements

- Web UI for browsing summaries
- User preferences and custom sources
- Enhanced content extraction for complex sites
- Multi-LLM provider support
- Analytics and performance tracking

## License


## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
