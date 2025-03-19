import { promptTemplates } from "../prompt-templates";

describe("Prompt Templates", () => {
  describe("Templates Structure", () => {
    it("should define required templates", () => {
      expect(promptTemplates).toHaveProperty("summary");
      expect(promptTemplates).toHaveProperty("tweetSummary");
      expect(promptTemplates).toHaveProperty("keyInfo");
    });

    it("should have templates as non-empty strings", () => {
      expect(typeof promptTemplates.summary).toBe("string");
      expect(promptTemplates.summary.length).toBeGreaterThan(0);

      expect(typeof promptTemplates.tweetSummary).toBe("string");
      expect(promptTemplates.tweetSummary.length).toBeGreaterThan(0);

      expect(typeof promptTemplates.keyInfo).toBe("string");
      expect(promptTemplates.keyInfo.length).toBeGreaterThan(0);
    });
  });

  describe("Summary Template", () => {
    it("should include placeholders for title and content", () => {
      expect(promptTemplates.summary).toContain("{{TITLE}}");
      expect(promptTemplates.summary).toContain("{{CONTENT}}");
    });

    it("should request required summary components", () => {
      expect(promptTemplates.summary).toContain("SUMMARY:");
      expect(promptTemplates.summary).toContain("SHORT SUMMARY:");
      expect(promptTemplates.summary).toContain("KEY POINTS:");
      expect(promptTemplates.summary).toContain("TOPICS:");
    });

    it("should provide clear formatting instructions", () => {
      expect(promptTemplates.summary).toContain(
        "Format your response exactly as:",
      );
    });
  });

  describe("Tweet Summary Template", () => {
    it("should include placeholders for title and summary", () => {
      expect(promptTemplates.tweetSummary).toContain("{{TITLE}}");
      expect(promptTemplates.tweetSummary).toContain("{{SUMMARY}}");
    });

    it("should mention the character limit", () => {
      expect(promptTemplates.tweetSummary).toContain("280 characters");
    });
  });

  describe("Key Info Template", () => {
    it("should include placeholders for title and content", () => {
      expect(promptTemplates.keyInfo).toContain("{{TITLE}}");
      expect(promptTemplates.keyInfo).toContain("{{CONTENT}}");
    });

    it("should request extraction of specific information types", () => {
      expect(promptTemplates.keyInfo).toContain(
        "Important facts and statistics",
      );
      expect(promptTemplates.keyInfo).toContain(
        "Relevant names, organizations, or products",
      );
      expect(promptTemplates.keyInfo).toContain(
        "Key dates or timeline information",
      );
    });
  });

  describe("Template Substitution", () => {
    it("should allow substituting title and content in summary template", () => {
      const title = "Test Article";
      const content = "This is test content.";

      const filledTemplate = promptTemplates.summary
        .replace("{{TITLE}}", title)
        .replace("{{CONTENT}}", content);

      expect(filledTemplate).toContain("Test Article");
      expect(filledTemplate).toContain("This is test content.");
      expect(filledTemplate).not.toContain("{{TITLE}}");
      expect(filledTemplate).not.toContain("{{CONTENT}}");
    });

    it("should allow substituting title and summary in tweet summary template", () => {
      const title = "Test Article";
      const summary = "This is a summary.";

      const filledTemplate = promptTemplates.tweetSummary
        .replace("{{TITLE}}", title)
        .replace("{{SUMMARY}}", summary);

      expect(filledTemplate).toContain("Test Article");
      expect(filledTemplate).toContain("This is a summary.");
      expect(filledTemplate).not.toContain("{{TITLE}}");
      expect(filledTemplate).not.toContain("{{SUMMARY}}");
    });
  });
});
