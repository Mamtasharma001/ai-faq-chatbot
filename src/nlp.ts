/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Comprehensive English Stop Words list
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'arent', 'as', 'at', 
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 
  'cant', 'cannot', 'could', 'couldnt', 'did', 'didnt', 'do', 'does', 'doesnt', 'doing', 'dont', 'down', 'during', 
  'each', 'few', 'for', 'from', 'further', 'had', 'hadnt', 'has', 'hasnt', 'have', 'havent', 'having', 
  'he', 'hed', 'hell', 'hes', 'her', 'here', 'heres', 'hers', 'herself', 'him', 'himself', 'his', 
  'how', 'hows', 'i', 'id', 'ill', 'im', 'ive', 'if', 'in', 'into', 'is', 'isnt', 'it', 'its', 'itself', 
  'lets', 'me', 'more', 'most', 'mustnt', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 
  'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 
  'same', 'shant', 'she', 'shed', 'shell', 'shes', 'should', 'shouldnt', 'so', 'some', 'such', 
  'than', 'that', 'thats', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'theres', 'these', 
  'they', 'theyd', 'theyll', 'theyre', 'theyve', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 
  'very', 'was', 'wasnt', 'we', 'wed', 'well', 'were', 'weve', 'werent', 'what', 'whats', 'when', 'whens', 
  'where', 'wheres', 'which', 'while', 'who', 'whos', 'whom', 'why', 'whys', 'with', 'wont', 'would', 'wouldnt', 
  'you', 'youd', 'youll', 'youre', 'youve', 'your', 'yours', 'yourself', 'yourselves'
]);

// Custom Irregular Lemmatization dictionary for technical/support contexts
const LEMMA_MAP: { [word: string]: string } = {
  // Verbs
  'am': 'be', 'is': 'be', 'are': 'be', 'was': 'be', 'were': 'be', 'been': 'be', 'being': 'be',
  'has': 'have', 'had': 'have', 'having': 'have',
  'does': 'do', 'did': 'do', 'doing': 'do', 'done': 'do',
  'goes': 'go', 'went': 'go', 'going': 'go', 'gone': 'go',
  'pricing': 'price', 'prices': 'price', 'priced': 'price',
  'billing': 'bill', 'bills': 'bill', 'billed': 'bill',
  'resetting': 'reset', 'resets': 'reset',
  'canceling': 'cancel', 'cancels': 'cancel', 'canceled': 'cancel', 'cancellation': 'cancel', 'cancellations': 'cancel',
  'updating': 'update', 'updates': 'update', 'updated': 'update',
  'creating': 'create', 'creates': 'create', 'created': 'create',
  'deleting': 'delete', 'deletes': 'delete', 'deleted': 'delete',
  'forgot': 'forget', 'forgotten': 'forget', 'forgetting': 'forget',
  'paying': 'pay', 'pays': 'pay', 'paid': 'pay', 'payment': 'pay', 'payments': 'pay',
  'refunding': 'refund', 'refunds': 'refund', 'refunded': 'refund',
  'subscribing': 'subscribe', 'subscribes': 'subscribe', 'subscribed': 'subscribe', 'subscription': 'subscribe', 'subscriptions': 'subscribe',
  'setting': 'set', 'settings': 'set',
  'changing': 'change', 'changes': 'change', 'changed': 'change',
  'integrating': 'integrate', 'integrates': 'integrate', 'integrated': 'integrate', 'integration': 'integrate',
  'adding': 'add', 'adds': 'add', 'added': 'add',
  
  // Nouns
  'people': 'person', 'children': 'child', 'men': 'man', 'women': 'woman',
  'devices': 'device', 'queries': 'query', 'policies': 'policy', 'accounts': 'account',
  'passwords': 'password', 'users': 'user', 'cards': 'card', 'emails': 'email', 'plans': 'plan',
  'methods': 'method', 'options': 'option', 'features': 'feature', 'keys': 'key', 'secrets': 'secret',
  'tokens': 'token', 'systems': 'system', 'backends': 'backend', 'databases': 'database',
  'guides': 'guide', 'services': 'service'
};

/**
 * Perform English word lemmatization using our manual lemmatizer mapping
 * falling back to suffix analysis rules for plurals, past tenses, and continuous tenses.
 */
export function lemmatize(word: string): string {
  const lowercaseWord = word.toLowerCase();
  
  // 1. Direct dictionary match
  if (LEMMA_MAP[lowercaseWord]) {
    return LEMMA_MAP[lowercaseWord];
  }
  
  // 2. Continuous verb forms suffix "-ing" (e.g. testing -> test)
  if (lowercaseWord.endsWith('ing') && lowercaseWord.length > 5) {
    const base = lowercaseWord.slice(0, -3);
    // If double consonant, strip one (e.g., resetting -> reset, getting -> get)
    if (base.length > 3 && base[base.length - 1] === base[base.length - 2]) {
      return base.slice(0, -1);
    }
    // If ends in e (e.g., make -> making, save -> saving)
    // We try to add 'e' or just return base
    return base;
  }

  // 3. Past tense suffix "-ed" (e.g. played -> play, checked -> check)
  if (lowercaseWord.endsWith('ed') && lowercaseWord.length > 4) {
    const base = lowercaseWord.slice(0, -2);
    if (base.endsWith('i')) { // e.g. tried -> try
      return base.slice(0, -1) + 'y';
    }
    return base;
  }

  // 4. Plurals: "-ies" -> "-y" (e.g. entities -> entity)
  if (lowercaseWord.endsWith('ies') && lowercaseWord.length > 4) {
    return lowercaseWord.slice(0, -3) + 'y';
  }

  // 5. Plurals: "-es" or "-s"
  if (lowercaseWord.endsWith('s') && !lowercaseWord.endsWith('ss') && !lowercaseWord.endsWith('us') && lowercaseWord.length > 3) {
    if (lowercaseWord.endsWith('es') && (lowercaseWord.endsWith('ches') || lowercaseWord.endsWith('shes') || lowercaseWord.endsWith('xes') || lowercaseWord.endsWith('ses'))) {
      return lowercaseWord.slice(0, -2);
    }
    return lowercaseWord.slice(0, -1);
  }

  return lowercaseWord;
}

/**
 * Preprocesses text according to requested NLP techniques:
 * 1. Lowercase conversion
 * 2. Remove punctuation
 * 3. Tokenization (splitting into word arrays)
 * 4. Stop word removal
 * 5. Lemmatization
 */
export function preprocess(text: string): string[] {
  if (!text) return [];

  // Convert to lowercase and remove punctuation
  // Keeps alphanumeric characters and spaces
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' '); // Keep dashes if they separate terms, replace others with spaces

  // Tokenize by whitespace
  const rawTokens = normalized.split(/\s+/);

  // Filter stop words and empty tokens, then apply lemmatization
  const processedTokens = rawTokens
    .map(token => token.trim())
    .filter(token => token.length > 0 && !STOP_WORDS.has(token))
    .map(token => lemmatize(token));

  return processedTokens;
}

/**
 * Sparse Vector representation for TF-IDF
 */
export type SparseVector = { [term: string]: number };

/**
 * Calculates IDF (Inverse Document Frequency) values for all unique terms in the dataset.
 */
export function computeIDF(documents: string[][]): { [term: string]: number } {
  const totalDocs = documents.length;
  const idf: { [term: string]: number } = {};
  const docCounts: { [term: string]: number } = {};

  // Count how many documents contain each term
  documents.forEach(doc => {
    const uniqueTerms = new Set(doc);
    uniqueTerms.forEach(term => {
      docCounts[term] = (docCounts[term] || 0) + 1;
    });
  });

  // Compute IDF = ln(1 + totalDocs / (1 + docCounts[term]))
  Object.keys(docCounts).forEach(term => {
    idf[term] = Math.log(1 + (totalDocs / (1 + docCounts[term])));
  });

  return idf;
}

/**
 * Computes TF-IDF sparse vector for a given list of tokens using trained IDF values.
 */
export function computeTFIDF(tokens: string[], idf: { [term: string]: number }): SparseVector {
  const vector: SparseVector = {};
  const totalTokens = tokens.length;
  if (totalTokens === 0) return vector;

  // Compute Term Frequency (TF) = count of term / total terms
  const termCounts: { [term: string]: number } = {};
  tokens.forEach(token => {
    termCounts[token] = (termCounts[token] || 0) + 1;
  });

  // Compute TF-IDF = TF * IDF
  Object.keys(termCounts).forEach(term => {
    const tf = termCounts[term] / totalTokens;
    const termIdf = idf[term] || 0; // If term is out-of-vocabulary, IDF is 0
    vector[term] = tf * termIdf;
  });

  return vector;
}

/**
 * Computes cosine similarity between two sparse TF-IDF vectors
 */
export function computeCosineSimilarity(v1: SparseVector, v2: SparseVector): number {
  let dotProduct = 0;
  let mag1Sq = 0;
  let mag2Sq = 0;

  // Get union of all terms to simplify calculations
  const termsV1 = Object.keys(v1);
  const termsV2 = Object.keys(v2);
  const allTerms = new Set([...termsV1, ...termsV2]);

  allTerms.forEach(term => {
    const val1 = v1[term] || 0;
    const val2 = v2[term] || 0;
    
    dotProduct += val1 * val2;
    mag1Sq += val1 * val1;
    mag2Sq += val2 * val2;
  });

  const mag1 = Math.sqrt(mag1Sq);
  const mag2 = Math.sqrt(mag2Sq);

  if (mag1 === 0 || mag2 === 0) {
    return 0;
  }

  return dotProduct / (mag1 * mag2);
}

/**
 * Intelligent FAQ matching class that wraps the preprocessing, tf-idf, and similarity calculations.
 */
export class FAQMatcher {
  private faqs: Array<{ id: string; question: string; answer: string }> = [];
  private idf: { [term: string]: number } = {};
  private faqVectors: Array<{ id: string; vector: SparseVector }> = [];

  constructor(faqs: Array<{ id: string; question: string; answer: string }>) {
    this.train(faqs);
  }

  /**
   * Train (or retrain) the FAQ matching engine.
   */
  public train(faqs: Array<{ id: string; question: string; answer: string }>) {
    this.faqs = faqs;
    if (faqs.length === 0) {
      this.idf = {};
      this.faqVectors = [];
      return;
    }

    // Preprocess all questions
    const preprocessedDocs = faqs.map(faq => preprocess(faq.question));

    // Compute IDFs
    this.idf = computeIDF(preprocessedDocs);

    // Compute TF-IDF vector for each FAQ question
    this.faqVectors = faqs.map((faq, index) => {
      const tokens = preprocessedDocs[index];
      const vector = computeTFIDF(tokens, this.idf);
      return { id: faq.id, vector };
    });
  }

  /**
   * Matches a query and returns similarity scores for all FAQs, sorted descending.
   */
  public match(query: string): Array<{ id: string; question: string; answer: string; similarity: number }> {
    const queryTokens = preprocess(query);
    const queryVector = computeTFIDF(queryTokens, this.idf);

    const matches = this.faqVectors.map((faqVec, index) => {
      const similarity = computeCosineSimilarity(queryVector, faqVec.vector);
      const originalFaq = this.faqs[index];
      return {
        ...originalFaq,
        similarity
      };
    });

    // Sort descending by similarity
    return matches.sort((a, b) => b.similarity - a.similarity);
  }
}
