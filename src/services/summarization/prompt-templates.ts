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
   * Template for generating a summary
   */
  summary: `
You are an expert summarizer who creates concise, informative summaries of articles.

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

   SUMMARY: A comprehensive summary (3-5 paragraphs) capturing the key information and main points of the article.

   SHORT SUMMARY: A very short (1-2 sentences) summary for quick understanding.

   KEY POINTS: The 3-5 most important takeaways from the article, listed as bullet points.

   TOPICS: A comma-separated list of topics/categories that this article covers.

Format your response exactly as:

SUMMARY:
[Your comprehensive summary here]

SHORT SUMMARY:
[Your short summary here]

KEY POINTS:
- [Key point 1]
- [Key point 2]
- [Key point 3]
- [Key point 4 if needed]
- [Key point 5 if needed]

TOPICS:
[topic1], [topic2], [topic3], [etc.]
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
