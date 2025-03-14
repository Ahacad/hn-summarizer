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

Please create a summary of this article with the following components:

1. SUMMARY: A comprehensive summary (3-5 paragraphs) capturing the key information and main points of the article.

2. SHORT SUMMARY: A very short (1-2 sentences) summary for quick understanding.

3. KEY POINTS: The 3-5 most important takeaways from the article, listed as bullet points.

4. TOPICS: A comma-separated list of topics/categories that this article covers.

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

Identify and list:
1. Important facts and statistics
2. Relevant names, organizations, or products
3. Key dates or timeline information
4. Core arguments or claims made
5. Any conclusions or outcomes described

Focus only on extracting factual information, not opinions or commentary.
`.trim()
};
