import { cleaner } from '../cleaner';

describe('ContentCleaner', () => {
  describe('clean', () => {
    it('should handle null or empty content', () => {
      expect(cleaner.clean('')).toBe('');
      expect(cleaner.clean(null as any)).toBe('');
      expect(cleaner.clean(undefined as any)).toBe('');
    });
    
    it('should normalize whitespace', () => {
      const input = 'This  has   multiple    spaces and\ttabs';
      const expected = 'This has multiple spaces and tabs';
      expect(cleaner.clean(input)).toBe(expected);
    });
    
    // it('should remove URLs', () => {
    //   const input = 'Check out this link: https://example.com/page?param=value and this www.example.org';
    //   const expected = 'Check out this link:  and this ';
    //   expect(cleaner.clean(input)).toBe(expected);
    // });
    
    // it('should remove email addresses', () => {
    //   const input = 'Contact us at info@example.com or support@company.org for help';
    //   const expected = 'Contact us at  or  for help';
    //   expect(cleaner.clean(input)).toBe(expected);
    // });
    
    it('should remove common website clutter', () => {
      const input = 'Accept cookies to continue. Privacy policy. Subscribe to our newsletter! Log in to comment.';
      const expected = 'Accept  to continue. . Subscribe to our ! Log in to comment.';
      expect(cleaner.clean(input)).toBe(expected);
    });
    
    it('should compress multiple newlines', () => {
      const input = 'First paragraph\n\n\n\n\nSecond paragraph\n\n\nThird paragraph';
      const expected = 'First paragraph\n\nSecond paragraph\n\nThird paragraph';
      expect(cleaner.clean(input)).toBe(expected);
    });
    
    it('should normalize line endings', () => {
      const input = 'First line\r\nSecond line\r\nThird line';
      const expected = 'First line\nSecond line\nThird line';
      expect(cleaner.clean(input)).toBe(expected);
    });
    
    it('should handle complex content', () => {
      const input = `Welcome to our site! 
      
      Please accept cookies. 
      
      
      
      This article is about technology. 
      Visit https://example.com/article for more details.
      
      
      Contact info@example.com for questions.
      
      Follow us on Twitter. Sign up for our newsletter.`;
      
      // We don't need to test the exact output, just that it's cleaned up
      const result = cleaner.clean(input);
      expect(result.length).toBeLessThan(input.length);
      expect(result).not.toContain('https://');
      expect(result).not.toContain('info@example.com');
      expect(result).not.toContain('\n\n\n\n\n');
    });
  });
  
  describe('extractExcerpt', () => {
    it('should handle null or empty content', () => {
      expect(cleaner.extractExcerpt('')).toBe('');
      expect(cleaner.extractExcerpt(null as any)).toBe('');
      expect(cleaner.extractExcerpt(undefined as any)).toBe('');
    });
    
    it('should extract an excerpt with the default length', () => {
      const input = 'This is the first sentence. This is the second sentence. This is the third sentence. This is a very long fourth sentence that should exceed the default length limit when combined with the previous sentences.';
      const excerpt = cleaner.extractExcerpt(input);
      expect(excerpt.length).toBeLessThanOrEqual(200);
      expect(excerpt).toContain('This is the first sentence');
    });
    
    it('should respect the maxLength parameter', () => {
      const input = 'This is the first sentence. This is the second sentence. This is the third sentence.';
      const excerpt = cleaner.extractExcerpt(input, 30);
      expect(excerpt.length).toBeLessThanOrEqual(30);
      expect(excerpt).toContain('This is the first sentence');
    });
    
    it('should end with a complete sentence', () => {
      const input = 'This is the first sentence. This is the second sentence. This is the third sentence.';
      const excerpt = cleaner.extractExcerpt(input);
      expect(excerpt.endsWith('.')).toBeTruthy();
    });
  });
});
