#!/usr/bin/env python3
"""
AI FAQ Chatbot - Flask & spaCy Backend Engine
This module contains the complete NLP matching backend.
"""

import os
import json
import time
import spacy
from flask import Flask, render_template, request, jsonify
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

app = Flask(__name__)

# Load small English language model.
# Note: Ensure to run 'python -m spacy download en_core_web_sm' before starting.
try:
    nlp = spacy.load("en_core_web_sm", disable=["parser", "ner"])
except IOError:
    # Fallback to importing sub-modules if not loaded globally, or raise clear error instructions
    print("Warning: spaCy model 'en_core_web_sm' not found. Please run: python -m spacy download en_core_web_sm")
    # We will load dynamic blank language if it fails to prevent startup crashes
    nlp = spacy.blank("en")

# Global containers for dataset & vector models
FAQS = []
VECTORIZER = None
TFIDF_MATRIX = None
PREPROCESSED_FAQ_LIST = []


def preprocess_text(text):
    """
    Performs full NLP text preprocessing using spaCy:
    - Lowercase conversion
    - Tokenization
    - Remove punctuation
    - Remove English stop words
    - Lemmatization (reducing words to base dictionary form)
    """
    if not text:
        return ""
    
    # Process text using spaCy pipeline
    doc = nlp(text.lower().strip())
    
    # Extract lemmatized forms of non-stop-word, non-punctuation tokens
    tokens = [
        token.lemma_ for token in doc 
        if not token.is_stop and not token.is_punct and token.text.strip()
    ]
    
    # Reassemble as a normalized space-separated string for TF-IDF Vectorizer
    return " ".join(tokens)


def load_and_train_faqs():
    """
    Loads FAQs from JSON file, processes them through the spaCy NLP pipeline,
    and builds the global TF-IDF matrix for fast cosine similarity lookups.
    """
    global FAQS, VECTORIZER, TFIDF_MATRIX, PREPROCESSED_FAQ_LIST
    
    faq_file_path = os.path.join(os.path.dirname(__file__), "faq.json")
    
    # 1. Read the JSON dataset
    if os.path.exists(faq_file_path):
        with open(faq_file_path, "r", encoding="utf-8") as f:
            FAQS = json.load(f)
    else:
        # Fallback inline standard FAQs in case file is absent
        FAQS = [
            {
                "category": "Billing",
                "question": "What is your refund policy for annual subscriptions?",
                "answer": "You can request a full refund within 30 days of purchase."
            },
            {
                "category": "Account",
                "question": "How do I reset my password?",
                "answer": "Click Forgot Password on the login page to send a reset link."
            }
        ]
        # Save fallback to ensure file exists
        with open(faq_file_path, "w", encoding="utf-8") as f:
            json.dump(FAQS, f, indent=2)

    # 2. Preprocess all questions
    PREPROCESSED_FAQ_LIST = [preprocess_text(faq["question"]) for faq in FAQS]
    
    # 3. Fit TF-IDF Vectorizer
    if PREPROCESSED_FAQ_LIST:
        VECTORIZER = TfidfVectorizer()
        TFIDF_MATRIX = VECTORIZER.fit_transform(PREPROCESSED_FAQ_LIST)
        print(f"Successfully trained TF-IDF matrix with {len(FAQS)} FAQs!")


@app.route("/")
def home():
    """
    Renders the main bento-grid chat interface template.
    """
    return render_template("index.html")


@app.route("/api/query", methods=["POST"])
def query_faq():
    """
    API endpoint to match user questions with stored FAQs using Cosine Similarity.
    Expects JSON: { "question": "user query" }
    """
    start_time = time.time()
    data = request.get_json() or {}
    user_question = data.get("question", "").strip()
    
    if not user_question:
        return jsonify({"error": "Empty question provided"}), 400
        
    global FAQS, VECTORIZER, TFIDF_MATRIX
    if VECTORIZER is None or TFIDF_MATRIX is None:
        return jsonify({"error": "NLP Engine model is not trained"}), 500

    # 1. Preprocess the incoming user query
    processed_query = preprocess_text(user_question)
    
    # 2. Vectorize the processed query using trained TF-IDF model
    query_vector = VECTORIZER.transform([processed_query])
    
    # 3. Calculate Cosine Similarities against all FAQ vectors
    similarities = cosine_similarity(query_vector, TFIDF_MATRIX).flatten()
    
    # 4. Find the highest similarity index and score
    best_match_idx = int(similarities.argsort()[-1])
    best_score = float(similarities[best_match_idx])
    
    # 5. Extract top 3 matches for visual dashboards
    top_indices = similarities.argsort()[-3:][::-1]
    top_matches = []
    for idx in top_indices:
        top_matches.append({
            "question": FAQS[int(idx)]["question"],
            "similarity": float(similarities[int(idx)])
        })

    # Record processing latency
    latency_ms = round((time.time() - start_time) * 1000, 2)

    # 6. Apply threshold filtering (0.40 score threshold)
    threshold = 0.40
    if best_score >= threshold:
        matched_faq = FAQS[best_match_idx]
        return jsonify({
            "answer": matched_faq["answer"],
            "matched_question": matched_faq["question"],
            "confidence": round(best_score * 100, 2),
            "top_matches": top_matches,
            "latency_ms": latency_ms
        })
    else:
        return jsonify({
            "answer": "I'm sorry, I couldn't find a relevant answer.",
            "matched_question": "None (Below Threshold)",
            "confidence": round(best_score * 100, 2),
            "top_matches": top_matches,
            "latency_ms": latency_ms
        })


@app.route("/api/faqs", methods=["GET", "POST"])
def manage_faqs():
    """
    API endpoint to list and append new FAQs dynamically, auto-triggering retraining.
    """
    global FAQS
    if request.method == "POST":
        data = request.get_json() or {}
        question = data.get("question", "").strip()
        answer = data.get("answer", "").strip()
        category = data.get("category", "General").strip()
        
        if not question or not answer:
            return jsonify({"error": "Question and Answer are required"}), 400
            
        new_faq = {
            "category": category,
            "question": question,
            "answer": answer
        }
        
        FAQS.append(new_faq)
        
        # Save updated FAQs back to the local database file
        faq_file_path = os.path.join(os.path.dirname(__file__), "faq.json")
        with open(faq_file_path, "w", encoding="utf-8") as f:
            json.dump(FAQS, f, indent=2)
            
        # Retrain TF-IDF vectors
        load_and_train_faqs()
        
        return jsonify({"message": "FAQ added and model retrained successfully", "faq": new_faq})
        
    return jsonify(FAQS)


if __name__ == "__main__":
    # Boot NLP pipeline on startup
    load_and_train_faqs()
    # Runs local Flask dev server on port 3000
    app.run(host="0.0.0.0", port=3000, debug=True)
