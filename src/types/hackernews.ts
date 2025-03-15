/**
 * HackerNews API Types
 *
 * This module defines TypeScript interfaces for the HackerNews API.
 * These types match the structure of the data returned by the official API.
 */

// Story ID type
export type HNStoryID = number;

// HackerNews item types
export type HNItemType = "story" | "comment" | "job" | "poll" | "pollopt";

// Base interface for all HackerNews items
export interface HNItem {
  id: HNStoryID;
  deleted?: boolean;
  type: HNItemType;
  by: string;
  time: number;
  dead?: boolean;
  kids?: HNStoryID[];
}

// Interface for stories
export interface HNStory extends HNItem {
  type: "story";
  title: string;
  url?: string; // URL might be missing for text posts
  text?: string; // Text content for posts without URLs
  score: number;
  descendants?: number; // Number of comments
}

// Interface for comments
export interface HNComment extends HNItem {
  type: "comment";
  text: string;
  parent: HNStoryID;
}

// Interface for jobs
export interface HNJob extends HNItem {
  type: "job";
  text?: string;
  url?: string;
  title: string;
}

// Interface for polls
export interface HNPoll extends HNItem {
  type: "poll";
  title: string;
  text?: string;
  score: number;
  parts: HNStoryID[]; // Poll options
  descendants: number;
}

// Interface for poll options
export interface HNPollOpt extends HNItem {
  type: "pollopt";
  text: string;
  score: number;
  parent: HNStoryID;
}
