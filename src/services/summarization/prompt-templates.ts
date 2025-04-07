/**
 * LLM Prompt Templates
 *
 * This module defines prompt templates for use with LLMs.
 * These templates provide instructions to the model for generating
 * high-quality summaries and other content.
 */

/**
 * Prompt templates for various LLM tasks
 */
export const promptTemplates = {
  /**
   * Template for generating a daily digest newspaper
   */
  dailyDigest: `
You are an expert tech journalist and editor creating a daily digest of top tech news stories from HackerNews.

TODAY'S DATE: {{DATE}}

STORIES COLLECTION:
{{STORIES}}

Create a compelling, well-organized daily tech newspaper that:

1. Identifies the 2-3 most important stories of the day as featured headlines
2. Groups related stories into logical thematic sections (like AI, Programming, Cloud, Security, etc.)
3. Writes a brief editor's introduction highlighting key trends or developments
4. Creates meaningful section introductions that explain why these topics matter today
5. Formats each story entry with:
   - A catchy but informative headline
   - A concise 1-2 sentence summary
   - A link to both the original article and HackerNews discussion

Format the digest in Markdown with the following structure:

# HackerNews Daily Digest - [Date]

[Editor's introduction - 2-3 sentences about the tech landscape today]

## Featured Headlines
[Most important 2-3 stories with slightly longer descriptions]

## [Section Name 1]
[Brief section introduction - 1-2 sentences about this category]

### [Story Title 1]
[Brief summary]
[Original Article](URL) | [Discuss on HackerNews](HN_URL)

### [Story Title 2]
...

## [Section Name 2]
...

Make this feel like a professionally curated tech newspaper, not just a list of links. Identify connections between stories where relevant.
`.trim(),
  /**
   * Template for generating a summary
   * Enhanced for Gemini 2.5 with larger context window
   */
  summary: `
You are an expert summarizer who creates comprehensive, informative summaries of articles.

ARTICLE TITLE: {{TITLE}}

ARTICLE CONTENT:
{{CONTENT}}

IMPORTANT: Before summarizing, first evaluate if the content represents a legitimate article that can be meaningfully summarized:

1. If the content appears to be:
   - An error page (access denied, 403, 404, robots.txt blocked)
   - A login page or paywall
   - Very minimal content (less than 2 paragraphs)
   - Mostly code or technical data without prose content
   - Other non-article content (privacy policies, terms of service, etc.)

   Then DO NOT attempt to create a detailed summary. Instead, briefly indicate what the content appears to be and why it can't be properly summarized. Format your response as:

   SUMMARY:
   Unable to provide a detailed summary. The content appears to be [brief explanation].

   SHORT SUMMARY:
   Content not available for summarization.

   KEY POINTS:
   - Content appears to be [type of content]
   - Not suitable for detailed summarization
   - Recommend checking the original article directly

   TOPICS:
   website error, content unavailable

2. If the content appears to be a legitimate article, please create a summary with the following components:

   SUMMARY: A comprehensive summary (4-7 paragraphs) capturing the key information, main points, and important nuances of the article. With the enhanced context capabilities, you can now include more detailed analysis and important context that might have been omitted in shorter summaries.

   SHORT SUMMARY: A concise (2-3 sentences) summary for quick understanding that captures the essence of the article.

   KEY POINTS: The 5-8 most important takeaways from the article, listed as bullet points. Include both main arguments and important supporting details.

   TOPICS: A comma-separated list of topics/categories that this article covers. Be comprehensive and include both primary and secondary topics.

Format your response exactly as:

SUMMARY:
[Your comprehensive summary here]

SHORT SUMMARY:
[Your short summary here]

KEY POINTS:
- [Key point 1]
- [Key point 2]
- [Key point 3]
- [Key point 4]
- [Key point 5]
- [Key point 6 if needed]
- [Key point 7 if needed]
- [Key point 8 if needed]

TOPICS:
[topic1], [topic2], [topic3], [topic4], [topic5], [etc.]
`.trim(),

  /**
   * Template for generating a tweet-sized summary
   */
  tweetSummary: `
You are an expert in creating engaging, informative tweet-sized summaries.

ARTICLE TITLE: {{TITLE}}

ARTICLE SUMMARY: {{SUMMARY}}

Create a tweet-sized summary (maximum 280 characters) that captures the most interesting aspect of this article. The tweet should be engaging and informative, making readers want to learn more. Do not include hashtags.

Tweet:
`.trim(),

  /**
   * Template for extracting key information from an article
   */
  keyInfo: `
Extract the most important factual information from this article.

ARTICLE TITLE: {{TITLE}}

ARTICLE CONTENT:
{{CONTENT}}

IMPORTANT: First assess if this content represents actual article content that can be analyzed.
If it appears to be an error page, login page, or non-article content, simply respond with:
"Unable to extract factual information. The content does not appear to be an article."

If it is legitimate article content, then proceed with the analysis below:

Identify and list:
1. Important facts and statistics
2. Relevant names, organizations, or products
3. Key dates or timeline information
4. Core arguments or claims made
5. Any conclusions or outcomes described

Focus only on extracting factual information, not opinions or commentary.
`.trim(),
};
