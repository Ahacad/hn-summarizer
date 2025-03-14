/**
 * Mock implementation of Google Generative AI SDK
 */

export enum HarmCategory {
  HARM_CATEGORY_HARASSMENT = 'HARM_CATEGORY_HARASSMENT',
  HARM_CATEGORY_HATE_SPEECH = 'HARM_CATEGORY_HATE_SPEECH',
  HARM_CATEGORY_SEXUALLY_EXPLICIT = 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  HARM_CATEGORY_DANGEROUS_CONTENT = 'HARM_CATEGORY_DANGEROUS_CONTENT',
}

export enum HarmBlockThreshold {
  BLOCK_NONE = 'BLOCK_NONE',
  BLOCK_ONLY_HIGH = 'BLOCK_ONLY_HIGH',
  BLOCK_MEDIUM_AND_ABOVE = 'BLOCK_MEDIUM_AND_ABOVE',
  BLOCK_LOW_AND_ABOVE = 'BLOCK_LOW_AND_ABOVE',
}

export class GoogleGenerativeAI {
  constructor(apiKey: string) {
    // Store API key if needed for tests
    this.apiKey = apiKey;
  }

  apiKey: string;

  getGenerativeModel({ model, generationConfig, safetySettings }: any) {
    return {
      generateContent: jest.fn().mockImplementation(async (prompt: string) => {
        // Return a mock response based on the prompt
        const responseText = this.generateMockResponse(prompt);
        
        return {
          response: {
            text: () => responseText,
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: responseText
                    }
                  ]
                }
              }
            ]
          }
        };
      })
    };
  }

  private generateMockResponse(prompt: string): string {
    // Check if the prompt is asking for a summary
    if (prompt.includes('ARTICLE TITLE:') && prompt.includes('ARTICLE CONTENT:')) {
      // Extract the title
      const titleMatch = prompt.match(/ARTICLE TITLE:(.*?)(?=ARTICLE CONTENT:|$)/s);
      const title = titleMatch ? titleMatch[1].trim() : 'Mock Article';
      
      // Generate a mock summary
      return `SUMMARY:
This is a mock summary of "${title}". The article discusses important topics and presents several key arguments. It provides context on the subject matter and offers insights into the implications.

SHORT SUMMARY:
A concise overview of ${title} highlighting the main points.

KEY POINTS:
- First key point about the article
- Second important takeaway from the content
- Third notable element from the discussion
- Fourth significant aspect worth mentioning

TOPICS:
technology, business, innovation, research`;
    }
    
    // Default response
    return "This is a mock response from the Google Generative AI SDK.";
  }
}
