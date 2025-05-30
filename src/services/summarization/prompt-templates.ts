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

Format the digest in a way that is compatible with Telegraph's import format (HTML subset) with the following structure:

<h2>HackerNews Daily Digest - [Date]</h2>

<p>[Editor's introduction - 2-3 sentences about the tech landscape today]</p>

<h3>Featured Headlines</h3>
[Most important 2-3 stories with slightly longer descriptions]

<h3>[Section Name 1]</h3>
<p>[Brief section introduction - 1-2 sentences about this category]</p>

<h4>[Story Title 1]</h4>
<p>[Brief summary]</p>
<p><a href="URL">Original Article</a> | <a href="HN_URL">Discuss on HackerNews</a></p>

<h4>[Story Title 2]</h4>
...

<h3>[Section Name 2]</h3>
...

Make this feel like a professionally curated tech newspaper, not just a list of links. Identify connections between stories where relevant.

IMPORTANT FORMAT GUIDELINES:
1. Use H2 for the main title, H3 for section headers, and H4 for story titles. Use <p> tags for paragraphs.
2. Use the exact HTML format '<a href="URL">Original Article</a> | <a href="HN_URL">Discuss on HackerNews</a>' for the links below each story summary. Do NOT use Markdown links.
3. Keep section introductions very concise (1-2 sentences maximum).
4. Limit the number of featured headlines to 3 maximum.
5. Ensure each story summary is no more than 3 lines.
6. DO NOT use Markdown code blocks with backticks. If you need to show code or HTML examples, wrap them in <pre> tags directly instead of using backticks.
7. IMPORTANT: Never start the digest with a code block or backticks, as this causes formatting issues.
8. DO NOT include the code/markup itself at the beginning of the digest - just start with your actual content.
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
