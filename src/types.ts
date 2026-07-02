/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface FAQ {
  id: string;
  question: string;
  answer: string;
  category?: string;
}

export interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  confidence?: number;
  matchedFAQId?: string;
  matchedFAQQuestion?: string;
  topMatches?: Array<{ question: string; similarity: number }>;
}

export interface SearchHistoryItem {
  id: string;
  text: string;
  timestamp: string;
  confidence: number;
}

export interface Analytics {
  totalQueries: number;
  averageConfidence: number;
  successRate: number; // Percentage of queries with similarity >= 0.40
  categoryDistribution: { [category: string]: number };
  matchedFAQCounts: { [question: string]: number };
}
