/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, FormEvent, ChangeEvent } from 'react';
import { 
  Bot, User, Mic, MicOff, Send, Trash2, Plus, Edit3, Save, Download, 
  RefreshCw, FileText, Upload, Activity, MessageSquare, Database, 
  Search, Sparkles, Clock, ArrowRight, Settings, Volume2, VolumeX, Check, X, Info 
} from 'lucide-react';
import { FAQ, Message, SearchHistoryItem, Analytics } from './types';
import { FAQMatcher, preprocess } from './nlp';
import { INITIAL_FAQS } from './data/initialFaqs';

export default function App() {
  // --- Persistent States ---
  const [faqs, setFaqs] = useState<FAQ[]>(() => {
    const saved = localStorage.getItem('ai_faq_chatbot_faqs');
    return saved ? JSON.parse(saved) : INITIAL_FAQS;
  });

  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>(() => {
    const saved = localStorage.getItem('ai_faq_chatbot_history');
    return saved ? JSON.parse(saved) : [];
  });

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'bot',
      text: "Hello! I am your AI FAQ Assistant. I can understand your questions naturally using TF-IDF and Cosine Similarity, even if you don't match the exact words. Go ahead and ask me anything!",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
  ]);

  // --- Interaction States ---
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isTtsEnabled, setIsTtsEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'admin' | 'analytics'>('chat');
  const [isTyping, setIsTyping] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number>(0);
  
  // --- Last Query Similarity Stats ---
  const [lastConfidence, setLastConfidence] = useState<number>(0);
  const [topMatches, setTopMatches] = useState<Array<{ question: string; similarity: number }>>([]);
  const [matchedFAQText, setMatchedFAQText] = useState<string>('');

  // --- Admin Form States ---
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [newCategory, setNewCategory] = useState('General');
  const [editingFaqId, setEditingFaqId] = useState<string | null>(null);
  const [editQuestion, setEditQuestion] = useState('');
  const [editAnswer, setEditAnswer] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  const [jsonUploadError, setJsonUploadError] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // --- Ref for Auto Scroll ---
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // --- FAQ NLP Matcher Instance ---
  const matcherRef = useRef<FAQMatcher | null>(null);

  // Initialize and retrain NLP Matcher whenever the FAQ database changes
  useEffect(() => {
    matcherRef.current = new FAQMatcher(faqs);
    localStorage.setItem('ai_faq_chatbot_faqs', JSON.stringify(faqs));
  }, [faqs]);

  // Save history to localStorage
  useEffect(() => {
    localStorage.setItem('ai_faq_chatbot_history', JSON.stringify(searchHistory));
  }, [searchHistory]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (activeTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping, activeTab]);

  // --- Text to Speech (TTS) ---
  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel(); // Stop any active speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  };

  // --- Speech to Text (Web Speech API) ---
  const toggleSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please try Chrome, Safari or Edge.");
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const speechToText = event.results[0][0].transcript;
      setInputText(speechToText);
      setIsListening(false);
      handleSendMessage(speechToText);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  // --- Match and Send Message Logic ---
  const handleSendMessage = (textToSend?: string) => {
    const queryText = (textToSend || inputText).trim();
    if (!queryText) return;

    // 1. Add user message
    const userMsgId = Date.now().toString();
    const userMessage: Message = {
      id: userMsgId,
      sender: 'user',
      text: queryText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsTyping(true);

    // 2. Perform NLP matching
    setTimeout(() => {
      const startTime = performance.now();
      if (!matcherRef.current) {
        matcherRef.current = new FAQMatcher(faqs);
      }

      const results = matcherRef.current.match(queryText);
      const endTime = performance.now();
      const timeTaken = Math.round(endTime - startTime);
      setLatencyMs(timeTaken);

      const bestMatch = results[0];
      const similarity = bestMatch ? bestMatch.similarity : 0;
      const confidencePercent = Math.round(similarity * 100);

      // Extract top 3 matches for visualization panel
      const top3 = results.slice(0, 3).map(r => ({
        question: r.question,
        similarity: r.similarity
      }));
      setTopMatches(top3);
      setLastConfidence(confidencePercent);

      // Determine response based on similarity score (threshold 0.40 as requested)
      let botAnswer = '';
      let matchedId = undefined;
      let matchedQuestion = undefined;

      if (similarity >= 0.40) {
        botAnswer = bestMatch.answer;
        matchedId = bestMatch.id;
        matchedQuestion = bestMatch.question;
        setMatchedFAQText(bestMatch.question);
      } else {
        botAnswer = "I'm sorry, I couldn't find a relevant answer.";
        setMatchedFAQText('None (Below Threshold)');
      }

      // Add to search history list
      const historyItem: SearchHistoryItem = {
        id: Date.now().toString(),
        text: queryText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        confidence: confidencePercent
      };
      setSearchHistory(prev => [historyItem, ...prev.slice(0, 19)]); // Keep last 20 items

      // 3. Trigger typing simulation and bot response
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'bot',
        text: botAnswer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        confidence: confidencePercent,
        matchedFAQId: matchedId,
        matchedFAQQuestion: matchedQuestion,
        topMatches: top3
      };

      setMessages(prev => [...prev, botMessage]);
      setIsTyping(false);

      // Auto TTS read if enabled
      if (isTtsEnabled) {
        speakText(botAnswer);
      }
    }, 750); // Small delay to make typing animation feel realistic
  };

  // --- Clear Chat History ---
  const clearChat = () => {
    setMessages([
      {
        id: 'welcome',
        sender: 'bot',
        text: "Chat cleared. Ask me any product or support question, and I will find the best FAQ match for you!",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setLastConfidence(0);
    setTopMatches([]);
    setMatchedFAQText('');
  };

  // --- Export Chat Log to Text file ---
  const exportChatLog = () => {
    let transcript = `=========================================\n`;
    transcript += `AI FAQ CHATBOT CONVERSATION EXPORT\n`;
    transcript += `Date: ${new Date().toLocaleDateString()}\n`;
    transcript += `=========================================\n\n`;

    messages.forEach((msg) => {
      const senderLabel = msg.sender === 'user' ? 'YOU' : 'BOT';
      transcript += `[${msg.timestamp}] ${senderLabel}:\n`;
      transcript += `${msg.text}\n`;
      if (msg.sender === 'bot' && msg.confidence !== undefined) {
        transcript += `Match Confidence: ${msg.confidence}%`;
        if (msg.matchedFAQQuestion) {
          transcript += ` (Matched: "${msg.matchedFAQQuestion}")`;
        }
        transcript += `\n`;
      }
      transcript += `\n-----------------------------------------\n\n`;
    });

    const blob = new Blob([transcript], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `FAQ_Chat_Transcript_${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // --- Admin Functions ---
  const handleAddFaq = (e: FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim() || !newAnswer.trim()) return;

    const newFaq: FAQ = {
      id: Date.now().toString(),
      question: newQuestion.trim(),
      answer: newAnswer.trim(),
      category: newCategory
    };

    setFaqs(prev => [...prev, newFaq]);
    setNewQuestion('');
    setNewAnswer('');
    alert("FAQ added successfully! NLP matching model retrained.");
  };

  const handleStartEdit = (faq: FAQ) => {
    setEditingFaqId(faq.id);
    setEditQuestion(faq.question);
    setEditAnswer(faq.answer);
    setEditCategory(faq.category || 'General');
  };

  const handleSaveEdit = (id: string) => {
    if (!editQuestion.trim() || !editAnswer.trim()) return;

    setFaqs(prev => prev.map(f => f.id === id ? {
      ...f,
      question: editQuestion.trim(),
      answer: editAnswer.trim(),
      category: editCategory
    } : f));

    setEditingFaqId(null);
  };

  const handleDeleteFaq = (id: string) => {
    if (confirm("Are you sure you want to delete this FAQ? This will trigger an automatic model retraining.")) {
      setFaqs(prev => prev.filter(f => f.id !== id));
    }
  };

  const handleResetFaqs = () => {
    if (confirm("Revert database to original standard FAQs? Custom additions will be overwritten.")) {
      setFaqs(INITIAL_FAQS);
    }
  };

  // --- File Upload JSON Handler ---
  const handleJsonUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        if (!Array.isArray(parsed)) {
          throw new Error("JSON must be a top-level array of FAQ objects.");
        }

        const validated: FAQ[] = parsed.map((item, index) => {
          if (!item.question || !item.answer) {
            throw new Error(`Item at index ${index} is missing "question" or "answer" field.`);
          }
          return {
            id: `uploaded-${Date.now()}-${index}`,
            question: String(item.question),
            answer: String(item.answer),
            category: item.category ? String(item.category) : 'Uploaded'
          };
        });

        setFaqs(prev => [...prev, ...validated]);
        setJsonUploadError(null);
        setShowUploadModal(false);
        alert(`Successfully imported and merged ${validated.length} FAQs! Model retrained successfully.`);
      } catch (err: any) {
        setJsonUploadError(err.message || "Invalid JSON formatting.");
      }
    };
    reader.readAsText(file);
  };

  // --- Analytics Derivations ---
  const computeAnalytics = (): Analytics => {
    const total = searchHistory.length;
    if (total === 0) {
      return {
        totalQueries: 0,
        averageConfidence: 0,
        successRate: 0,
        categoryDistribution: {},
        matchedFAQCounts: {}
      };
    }

    const matchedQueries = searchHistory.filter(h => h.confidence >= 40);
    const avgConf = Math.round(searchHistory.reduce((acc, h) => acc + h.confidence, 0) / total);
    const success = Math.round((matchedQueries.length / total) * 100);

    // Map categories count of existing FAQs
    const catDist: { [key: string]: number } = {};
    faqs.forEach(f => {
      const cat = f.category || 'General';
      catDist[cat] = (catDist[cat] || 0) + 1;
    });

    // Simulated matched frequencies
    const freqMatch: { [key: string]: number } = {};
    messages.forEach(msg => {
      if (msg.sender === 'bot' && msg.matchedFAQQuestion) {
        freqMatch[msg.matchedFAQQuestion] = (freqMatch[msg.matchedFAQQuestion] || 0) + 1;
      }
    });

    return {
      totalQueries: total,
      averageConfidence: avgConf,
      successRate: success,
      categoryDistribution: catDist,
      matchedFAQCounts: freqMatch
    };
  };

  const stats = computeAnalytics();

  // --- Quick UI Helper: Confidence Color Scheme ---
  const getConfidenceColor = (score: number) => {
    if (score >= 75) return { border: 'text-emerald-500', text: 'text-emerald-400', label: 'High' };
    if (score >= 40) return { border: 'text-amber-500', text: 'text-amber-400', label: 'Medium' };
    return { border: 'text-rose-500', text: 'text-rose-400', label: 'Low Match' };
  };

  const confColor = getConfidenceColor(lastConfidence);

  return (
    <div id="app-root" className="w-full min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none antialiased">
      
      {/* 1. HEADER */}
      <header id="main-header" className="h-16 border-b border-slate-900 bg-slate-900/40 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-40">
        <div id="header-brand" className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-sky-500 to-sky-600 rounded-xl flex items-center justify-center shadow-lg shadow-sky-500/10">
            <Bot className="w-5 h-5 text-slate-950 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">AI FAQ Chatbot</h1>
            <p className="text-[10px] text-slate-500 font-mono">MODEL CORE: TF-IDF ENGINE</p>
          </div>
        </div>

        {/* Navigation Selector */}
        <div id="header-navigation" className="flex items-center gap-1.5 bg-slate-950/80 p-1 border border-slate-900 rounded-xl">
          <button 
            id="nav-chat"
            onClick={() => setActiveTab('chat')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'chat' 
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/15' 
                : 'text-slate-400 hover:text-white hover:bg-slate-900/50'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat Terminal</span>
          </button>
          <button 
            id="nav-analytics"
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'analytics' 
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/15' 
                : 'text-slate-400 hover:text-white hover:bg-slate-900/50'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Analytics Dashboard</span>
          </button>
          <button 
            id="nav-admin"
            onClick={() => setActiveTab('admin')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'admin' 
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/15' 
                : 'text-slate-400 hover:text-white hover:bg-slate-900/50'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>FAQ Console</span>
          </button>
        </div>

        {/* Live Indicator */}
        <div id="header-status" className="hidden md:flex items-center gap-4 text-xs font-medium uppercase tracking-wider text-slate-400">
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[10px] text-emerald-400 font-bold font-mono">Live Engine</span>
          </div>
        </div>
      </header>

      {/* 2. CHAT TAB LAYOUT */}
      {activeTab === 'chat' && (
        <main id="chat-layout" className="flex-1 w-full max-w-7xl mx-auto flex flex-col lg:flex-row p-4 gap-4 overflow-hidden h-[calc(100vh-64px-40px)]">
          
          {/* LEFT BENTO PANEL (Width: 64 equivalent or responsive) */}
          <aside id="chat-left-sidebar" className="w-full lg:w-72 flex flex-col gap-4 flex-shrink-0 h-full overflow-y-auto lg:overflow-hidden">
            
            {/* Search History Card */}
            <div id="search-history-card" className="bg-slate-900/40 border border-slate-900 rounded-2xl p-4 flex-1 flex flex-col overflow-hidden backdrop-blur-sm min-h-[220px]">
              <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <h2 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" /> Search History
                </h2>
                {searchHistory.length > 0 && (
                  <button 
                    onClick={() => setSearchHistory([])}
                    className="text-[10px] text-rose-500 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 scrollbar-thin scrollbar-thumb-slate-800">
                {searchHistory.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-4">
                    <p className="text-xs text-slate-600">No query history yet.</p>
                  </div>
                ) : (
                  searchHistory.map((item) => (
                    <div 
                      key={item.id}
                      onClick={() => handleSendMessage(item.text)}
                      className="p-3 rounded-xl bg-slate-950/50 border border-slate-900 text-xs text-slate-300 hover:border-sky-500/40 transition-all cursor-pointer hover:bg-slate-900/20 group relative overflow-hidden"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <span className="line-clamp-2 leading-relaxed group-hover:text-sky-400">{item.text}</span>
                        <span className="text-[9px] text-slate-600 font-mono flex-shrink-0">{item.timestamp}</span>
                      </div>
                      <div className="mt-1.5 flex justify-between items-center text-[10px]">
                        <span className="text-slate-500">Confidence:</span>
                        <span className={`font-bold font-mono ${getConfidenceColor(item.confidence).text}`}>{item.confidence}%</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Quick Suggestions Card */}
            <div id="suggested-queries-card" className="bg-slate-900/40 border border-slate-900 rounded-2xl p-4 h-64 flex flex-col overflow-hidden backdrop-blur-sm">
              <h2 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-3 flex-shrink-0 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-sky-400" /> Quick Topics
              </h2>
              <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2">
                <button 
                  onClick={() => handleSendMessage("What is your refund policy?")}
                  className="w-full text-left px-3 py-2 bg-slate-950/40 hover:bg-slate-900/50 hover:border-sky-500/30 border border-slate-900/80 rounded-xl text-xs text-slate-400 hover:text-sky-400 transition-all flex items-center justify-between group cursor-pointer"
                >
                  <span className="truncate">Refund Policies</span>
                  <ArrowRight className="w-3 h-3 text-slate-600 group-hover:text-sky-500 transition-colors flex-shrink-0" />
                </button>
                <button 
                  onClick={() => handleSendMessage("How do I reset my password?")}
                  className="w-full text-left px-3 py-2 bg-slate-950/40 hover:bg-slate-900/50 hover:border-sky-500/30 border border-slate-900/80 rounded-xl text-xs text-slate-400 hover:text-sky-400 transition-all flex items-center justify-between group cursor-pointer"
                >
                  <span className="truncate">Password Recovery</span>
                  <ArrowRight className="w-3 h-3 text-slate-600 group-hover:text-sky-500 transition-colors flex-shrink-0" />
                </button>
                <button 
                  onClick={() => handleSendMessage("Do you have an API?")}
                  className="w-full text-left px-3 py-2 bg-slate-950/40 hover:bg-slate-900/50 hover:border-sky-500/30 border border-slate-900/80 rounded-xl text-xs text-slate-400 hover:text-sky-400 transition-all flex items-center justify-between group cursor-pointer"
                >
                  <span className="truncate">Developer API keys</span>
                  <ArrowRight className="w-3 h-3 text-slate-600 group-hover:text-sky-500 transition-colors flex-shrink-0" />
                </button>
                <button 
                  onClick={() => handleSendMessage("How to enable multi-factor authentication?")}
                  className="w-full text-left px-3 py-2 bg-slate-950/40 hover:bg-slate-900/50 hover:border-sky-500/30 border border-slate-900/80 rounded-xl text-xs text-slate-400 hover:text-sky-400 transition-all flex items-center justify-between group cursor-pointer"
                >
                  <span className="truncate">MFA Setup Guard</span>
                  <ArrowRight className="w-3 h-3 text-slate-600 group-hover:text-sky-500 transition-colors flex-shrink-0" />
                </button>
              </div>
            </div>
          </aside>

          {/* MAIN CHAT AREA (BENTO CONTAINER) */}
          <section id="chat-center-stage" className="flex-1 flex flex-col bg-slate-900/10 border border-slate-900 rounded-2xl overflow-hidden backdrop-blur-sm relative h-full">
            
            {/* Upper Toolbar */}
            <div className="px-4 py-2 bg-slate-900/20 border-b border-slate-950/50 flex justify-between items-center text-xs">
              <span className="text-slate-500 font-mono">Terminal Target: Live FAQ Database ({faqs.length} documents)</span>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsTtsEnabled(!isTtsEnabled)}
                  className={`flex items-center gap-1 cursor-pointer transition-colors ${isTtsEnabled ? 'text-sky-400' : 'text-slate-500 hover:text-slate-300'}`}
                  title={isTtsEnabled ? "Disable text-to-speech" : "Enable text-to-speech"}
                >
                  {isTtsEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                  <span>TTS {isTtsEnabled ? 'On' : 'Off'}</span>
                </button>
                <button 
                  onClick={clearChat}
                  className="text-slate-500 hover:text-rose-400 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Screen</span>
                </button>
              </div>
            </div>

            {/* Scrolling Bubbles container */}
            <div id="chat-bubble-container" className="flex-1 p-5 overflow-y-auto space-y-5 scrollbar-thin scrollbar-thumb-slate-900">
              {messages.map((msg) => (
                <div 
                  key={msg.id}
                  className={`flex items-start gap-3.5 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  {/* Avatar */}
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                    msg.sender === 'user' 
                      ? 'bg-sky-500/10 border-sky-500/20 text-sky-400' 
                      : 'bg-slate-900 border-slate-800 text-slate-300'
                  }`}>
                    {msg.sender === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>

                  {/* Bubble body */}
                  <div className="max-w-[85%] sm:max-w-[75%] flex flex-col">
                    <div className={`p-4 rounded-2xl relative border ${
                      msg.sender === 'user'
                        ? 'bg-sky-500/5 border-sky-500/15 rounded-tr-none text-slate-100 selection:bg-sky-500/20'
                        : 'bg-slate-900/60 border-slate-900/80 rounded-tl-none text-slate-300'
                    }`}>
                      <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-line font-medium">{msg.text}</p>
                      
                      {/* Confidence and highlighting metrics on matched bot bubbles */}
                      {msg.sender === 'bot' && msg.confidence !== undefined && (
                        <div className="mt-3.5 p-2 bg-slate-950/80 rounded-xl border border-slate-900 flex flex-wrap gap-2 items-center justify-between">
                          <span className="text-[9px] font-mono tracking-wider font-bold text-slate-500 flex items-center gap-1">
                            <Info className="w-3 h-3 text-slate-600" />
                            <span>COGNITIVE MATCH: {msg.confidence}%</span>
                          </span>
                          {msg.matchedFAQQuestion && (
                            <span className="text-[9px] font-semibold text-sky-400 max-w-[150px] truncate">
                              "{msg.matchedFAQQuestion}"
                            </span>
                          )}
                          <button 
                            onClick={() => speakText(msg.text)}
                            className="text-[9px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-0.5 hover:underline cursor-pointer ml-auto"
                          >
                            <Volume2 className="w-2.5 h-2.5" /> Speak
                          </button>
                        </div>
                      )}
                    </div>
                    
                    {/* Timestamp below */}
                    <span className={`text-[9px] text-slate-600 mt-1.5 font-mono ${msg.sender === 'user' ? 'text-right' : 'text-left'}`}>
                      {msg.timestamp}
                    </span>
                  </div>
                </div>
              ))}

              {/* Simulated typing feedback */}
              {isTyping && (
                <div className="flex items-start gap-3.5">
                  <div className="w-8 h-8 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-sky-400 animate-spin" />
                  </div>
                  <div className="bg-slate-900/30 border border-slate-900/60 p-4 rounded-2xl rounded-tl-none max-w-[80%] flex items-center gap-3">
                    <div className="flex gap-1.5">
                      <span className="w-2 h-2 bg-sky-500 rounded-full animate-bounce"></span>
                      <span className="w-2 h-2 bg-sky-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                      <span className="w-2 h-2 bg-sky-500 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                    </div>
                    <span className="text-[11px] font-medium text-slate-500 font-mono uppercase tracking-wider">Processing NLP Vectors...</span>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input Form layout */}
            <div className="p-4 bg-slate-900/30 border-t border-slate-900 flex gap-3 items-center flex-shrink-0">
              <button 
                onClick={toggleSpeechRecognition}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  isListening 
                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 animate-pulse' 
                    : 'bg-slate-950/80 border-slate-900 text-slate-400 hover:text-white hover:border-slate-800'
                }`}
                title="Voice input (Web Speech API)"
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <input 
                type="text" 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSendMessage(); }}
                placeholder={isListening ? "Listening... Speak your support question" : "Type your search or FAQ query here..."}
                className="flex-1 bg-slate-950/80 border border-slate-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500/50 text-slate-100 placeholder-slate-600 transition-all font-medium"
              />

              <button 
                onClick={() => handleSendMessage()}
                disabled={!inputText.trim()}
                className={`p-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  inputText.trim() 
                    ? 'bg-sky-500 text-slate-950 hover:bg-sky-400 shadow-lg shadow-sky-500/10' 
                    : 'bg-slate-900 text-slate-600 border border-slate-950 cursor-not-allowed'
                }`}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </section>

          {/* RIGHT BENTO PANEL (Width: 64 equivalent or responsive) */}
          <aside id="chat-right-sidebar" className="w-full lg:w-72 flex flex-col gap-4 flex-shrink-0 h-full overflow-y-auto lg:overflow-hidden">
            
            {/* Real-time Confidence Ring Card */}
            <div id="confidence-gauge-card" className="bg-slate-900/40 border border-slate-900 rounded-2xl p-4 flex flex-col items-center backdrop-blur-sm relative overflow-hidden">
              <h2 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-4 w-full flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-sky-400" /> NLP Confidence
              </h2>
              
              <div className="relative w-32 h-32 flex items-center justify-center my-2">
                <svg className="w-full h-full -rotate-90">
                  <circle 
                    cx="64" 
                    cy="64" 
                    r="52" 
                    stroke="currentColor" 
                    strokeWidth="8" 
                    fill="transparent" 
                    className="text-slate-950/80 border"
                  />
                  <circle 
                    cx="64" 
                    cy="64" 
                    r="52" 
                    stroke="currentColor" 
                    strokeWidth="8" 
                    fill="transparent" 
                    strokeDasharray="326.72" 
                    strokeDashoffset={326.72 - (326.72 * lastConfidence) / 100}
                    className={`transition-all duration-700 ease-out ${
                      lastConfidence >= 75 
                        ? 'text-emerald-500' 
                        : lastConfidence >= 40 
                          ? 'text-amber-500' 
                          : 'text-rose-500'
                    }`}
                  />
                </svg>
                <div className="absolute text-center">
                  <span className="text-3xl font-extrabold tracking-tight">{lastConfidence}</span>
                  <span className="text-xs text-slate-500 font-bold">%</span>
                  <div className={`text-[9px] font-extrabold uppercase font-mono tracking-wider mt-0.5 ${confColor.text}`}>
                    {confColor.label}
                  </div>
                </div>
              </div>

              {/* Status details */}
              <div className="w-full mt-4 p-3 bg-slate-950/40 border border-slate-900 rounded-xl text-[10px] space-y-1.5 text-slate-500 font-mono">
                <div className="flex justify-between">
                  <span>Match Target:</span>
                  <span className="text-slate-300 font-semibold truncate max-w-[120px]">{matchedFAQText || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span>NLP Latency:</span>
                  <span className="text-emerald-400 font-semibold">{latencyMs > 0 ? `${latencyMs}ms` : '0ms'}</span>
                </div>
              </div>
            </div>

            {/* Top Similar Matches Card */}
            <div id="similar-matches-card" className="bg-slate-900/40 border border-slate-900 rounded-2xl p-4 flex-1 flex flex-col overflow-hidden backdrop-blur-sm min-h-[180px]">
              <h2 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-4 flex-shrink-0 flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-sky-400" /> Top Similar Matches
              </h2>
              <div className="flex-1 overflow-y-auto pr-1 space-y-4">
                {topMatches.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-4">
                    <p className="text-xs text-slate-600">No matching analytics yet. Submit a query.</p>
                  </div>
                ) : (
                  topMatches.map((match, i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="flex justify-between text-[11px] font-medium gap-2">
                        <span className="text-slate-300 truncate leading-relaxed">{match.question}</span>
                        <span className="font-mono text-slate-500 flex-shrink-0">{Math.round(match.similarity * 100)}%</span>
                      </div>
                      <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-900">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            match.similarity >= 0.75 
                              ? 'bg-emerald-500' 
                              : match.similarity >= 0.40 
                                ? 'bg-amber-500' 
                                : 'bg-slate-600'
                          }`}
                          style={{ width: `${Math.round(match.similarity * 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Export log trigger button */}
            <button 
              onClick={exportChatLog}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-extrabold text-sky-400 hover:text-white transition-all cursor-pointer flex items-center justify-center gap-2 hover:border-sky-500/30 shadow-md shadow-sky-500/5"
            >
              <Download className="w-4 h-4" />
              <span>EXPORT CHAT LOG (TXT)</span>
            </button>
          </aside>
        </main>
      )}

      {/* 3. ANALYTICS VIEW */}
      {activeTab === 'analytics' && (
        <main id="analytics-layout" className="flex-1 w-full max-w-7xl mx-auto p-4 flex flex-col gap-4 overflow-y-auto h-[calc(100vh-64px-40px)]">
          
          {/* Header Metric blocks (4-column grid) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            
            <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 backdrop-blur-sm">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 font-mono">Total Questions Asked</span>
              <p className="text-3xl font-extrabold mt-1.5 text-white">{stats.totalQueries}</p>
              <p className="text-[10px] text-slate-600 font-mono mt-1">Live tracking search logs</p>
            </div>

            <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 backdrop-blur-sm">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 font-mono">Core Similarity Match Rate</span>
              <p className="text-3xl font-extrabold mt-1.5 text-sky-400">{stats.successRate}%</p>
              <p className="text-[10px] text-slate-600 font-mono mt-1">Queries above 0.40 threshold</p>
            </div>

            <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 backdrop-blur-sm">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 font-mono">Average Match Score</span>
              <p className="text-3xl font-extrabold mt-1.5 text-amber-400">{stats.averageConfidence}%</p>
              <p className="text-[10px] text-slate-600 font-mono mt-1">Overall semantic accuracy</p>
            </div>

            <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 backdrop-blur-sm">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 font-mono">Total FAQs Programmed</span>
              <p className="text-3xl font-extrabold mt-1.5 text-emerald-400">{faqs.length}</p>
              <p className="text-[10px] text-slate-600 font-mono mt-1">Active document catalog</p>
            </div>

          </div>

          {/* Secondary Analytical Bento Grids */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            
            {/* Category FAQ counts */}
            <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 backdrop-blur-sm">
              <h2 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-5 flex items-center gap-2">
                <Database className="w-4 h-4 text-sky-400" /> FAQ Distribution by Category
              </h2>
              <div className="space-y-4">
                {Object.keys(stats.categoryDistribution).length === 0 ? (
                  <p className="text-xs text-slate-600">No categories found.</p>
                ) : (
                  Object.entries(stats.categoryDistribution).map(([cat, count]) => {
                    const percentage = Math.round((count / faqs.length) * 100);
                    return (
                      <div key={cat} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-slate-300">{cat}</span>
                          <span className="text-slate-500">{count} {count === 1 ? 'document' : 'documents'} ({percentage}%)</span>
                        </div>
                        <div className="w-full bg-slate-950 h-2.5 rounded-full border border-slate-900 overflow-hidden">
                          <div 
                            className="bg-sky-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Simulated Live Query Traffic Chart */}
            <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 backdrop-blur-sm">
              <h2 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-5 flex items-center gap-2">
                <Activity className="w-4 h-4 text-sky-400" /> Most Triggered FAQs (Trigger Counter)
              </h2>
              <div className="space-y-4">
                {Object.keys(stats.matchedFAQCounts).length === 0 ? (
                  <div className="h-44 flex flex-col items-center justify-center text-center p-4 border border-dashed border-slate-900 rounded-xl bg-slate-950/20">
                    <p className="text-xs text-slate-600">No matches logged during this session.</p>
                    <p className="text-[10px] text-slate-700 mt-1">Start chatting with the bot to trigger FAQ hits and view logs.</p>
                  </div>
                ) : (
                  Object.entries(stats.matchedFAQCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([question, count], i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 border border-slate-900 text-xs text-slate-300">
                        <span className="truncate max-w-[80%] font-semibold leading-relaxed">"{question}"</span>
                        <div className="px-3 py-1 bg-sky-500/10 border border-sky-500/20 rounded-lg text-sky-400 font-extrabold font-mono text-[10px] flex items-center gap-1">
                          <span>Hits:</span>
                          <span>{count}</span>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>

          </div>

          {/* Search history table logs */}
          <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 backdrop-blur-sm flex-1">
            <h2 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-400" /> Full Analytical Query Log
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-900 text-slate-500 uppercase font-bold tracking-wider text-[10px]">
                    <th className="py-3 px-4 font-mono">Timestamp</th>
                    <th className="py-3 px-4">User Question Asked</th>
                    <th className="py-3 px-4 text-right font-mono">NLP Similarity Match</th>
                    <th className="py-3 px-4 text-center font-mono">Status Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/50 font-medium">
                  {searchHistory.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-600">No log files recorded yet. Ask support questions on the chat terminal first!</td>
                    </tr>
                  ) : (
                    searchHistory.map((h) => {
                      const col = getConfidenceColor(h.confidence);
                      return (
                        <tr key={h.id} className="hover:bg-slate-900/20 transition-colors text-slate-300">
                          <td className="py-3.5 px-4 font-mono text-slate-500 text-[10px]">{h.timestamp}</td>
                          <td className="py-3.5 px-4 font-semibold text-slate-100">{h.text}</td>
                          <td className={`py-3.5 px-4 text-right font-mono font-bold ${col.text}`}>{h.confidence}%</td>
                          <td className="py-3.5 px-4 text-center">
                            <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold tracking-wider uppercase bg-slate-950 border ${
                              h.confidence >= 75 
                                ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5' 
                                : h.confidence >= 40 
                                  ? 'border-amber-500/30 text-amber-400 bg-amber-500/5' 
                                  : 'border-rose-500/30 text-rose-400 bg-rose-500/5'
                            }`}>
                              {col.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      )}

      {/* 4. ADMIN VIEW (FAQ PORTAL) */}
      {activeTab === 'admin' && (
        <main id="admin-layout" className="flex-1 w-full max-w-7xl mx-auto p-4 flex flex-col lg:flex-row gap-4 overflow-hidden h-[calc(100vh-64px-40px)]">
          
          {/* Left Form controls */}
          <aside className="w-full lg:w-96 flex flex-col gap-4 h-full overflow-y-auto">
            
            {/* Create FAQ Card */}
            <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 backdrop-blur-sm">
              <h2 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Plus className="w-4 h-4 text-sky-400" /> Add New FAQ Document
              </h2>
              <form onSubmit={handleAddFaq} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Category Name</label>
                  <select 
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-900 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500/50"
                  >
                    <option value="General">General</option>
                    <option value="Billing">Billing</option>
                    <option value="Technical">Technical</option>
                    <option value="Security">Security</option>
                    <option value="Account">Account</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Question Text</label>
                  <input 
                    type="text" 
                    value={newQuestion}
                    onChange={(e) => setNewQuestion(e.target.value)}
                    placeholder="e.g. How do I upgrade my storage limits?"
                    className="w-full bg-slate-950 border border-slate-900 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500/50 placeholder-slate-700"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Answer Body</label>
                  <textarea 
                    value={newAnswer}
                    onChange={(e) => setNewAnswer(e.target.value)}
                    placeholder="Provide the accurate answer for user mapping..."
                    rows={4}
                    className="w-full bg-slate-950 border border-slate-900 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500/50 placeholder-slate-700 resize-none"
                    required
                  />
                </div>

                <button 
                  type="submit"
                  className="w-full py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Save FAQ & Retrain Model
                </button>
              </form>
            </div>

            {/* Quick Bulk Tools */}
            <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 backdrop-blur-sm space-y-3.5">
              <h2 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Settings className="w-4 h-4" /> Bulk Operations
              </h2>
              
              <button 
                onClick={() => setShowUploadModal(true)}
                className="w-full py-2.5 bg-slate-950 hover:bg-slate-900 border border-slate-900 hover:border-slate-800 text-slate-300 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" /> Bulk Upload FAQ JSON
              </button>

              <button 
                onClick={handleResetFaqs}
                className="w-full py-2.5 bg-slate-950 hover:bg-slate-900 border border-slate-900 hover:border-slate-800 text-slate-400 hover:text-rose-400 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Revert Database Defaults
              </button>
            </div>
          </aside>

          {/* Right listing table */}
          <section className="flex-1 bg-slate-900/10 border border-slate-900 rounded-2xl p-5 flex flex-col overflow-hidden backdrop-blur-sm h-full">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 flex-shrink-0">
              <div>
                <h2 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Database className="w-4 h-4 text-sky-400" /> FAQ Database Catalog ({faqs.length} entries)
                </h2>
                <p className="text-[10px] text-slate-600 font-mono mt-0.5">Dynamic database, indexed reactively for vectors</p>
              </div>

              {/* Dynamic Search */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-600 absolute left-3.5 top-3" />
                <input 
                  type="text"
                  value={adminSearchQuery}
                  onChange={(e) => setAdminSearchQuery(e.target.value)}
                  placeholder="Filter FAQ documents..."
                  className="w-full bg-slate-950/80 border border-slate-900 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-sky-500/50"
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 scrollbar-thin scrollbar-thumb-slate-900">
              {faqs
                .filter(faq => 
                  faq.question.toLowerCase().includes(adminSearchQuery.toLowerCase()) || 
                  faq.answer.toLowerCase().includes(adminSearchQuery.toLowerCase()) ||
                  (faq.category || '').toLowerCase().includes(adminSearchQuery.toLowerCase())
                )
                .map((faq) => (
                  <div 
                    key={faq.id}
                    className="p-4 rounded-xl bg-slate-950/50 border border-slate-900 flex flex-col gap-3 relative hover:border-slate-800 transition-all group"
                  >
                    {/* Header bar of card */}
                    <div className="flex justify-between items-center gap-3">
                      <span className="px-2 py-0.5 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded text-[9px] font-extrabold uppercase font-mono tracking-wider">
                        {faq.category || 'General'}
                      </span>
                      
                      <div className="flex items-center gap-1.5 opacity-80 md:opacity-0 group-hover:opacity-100 transition-opacity">
                        {editingFaqId !== faq.id ? (
                          <>
                            <button 
                              onClick={() => handleStartEdit(faq)}
                              className="p-1 text-slate-400 hover:text-sky-400 cursor-pointer"
                              title="Edit FAQ"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => handleDeleteFaq(faq.id)}
                              className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                              title="Delete FAQ"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button 
                              onClick={() => handleSaveEdit(faq.id)}
                              className="p-1 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                              title="Save Changes"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => setEditingFaqId(null)}
                              className="p-1 text-rose-400 hover:text-rose-300 cursor-pointer"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Content editing or standard viewing */}
                    {editingFaqId === faq.id ? (
                      <div className="space-y-3 mt-1 text-xs">
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-500 uppercase">Edit Question</label>
                          <input 
                            type="text"
                            value={editQuestion}
                            onChange={(e) => setEditQuestion(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-500 uppercase">Edit Answer</label>
                          <textarea 
                            value={editAnswer}
                            onChange={(e) => setEditAnswer(e.target.value)}
                            rows={3}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 resize-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-500 uppercase">Edit Category</label>
                          <input 
                            type="text"
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 mt-1">
                        <h3 className="text-xs sm:text-sm font-bold text-white leading-relaxed">
                          Q: {faq.question}
                        </h3>
                        <p className="text-xs text-slate-400 leading-relaxed font-medium">
                          A: {faq.answer}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </section>
        </main>
      )}

      {/* 5. FOOTER */}
      <footer id="main-footer" className="h-10 bg-slate-950 border-t border-slate-900 px-6 flex items-center justify-between text-[10px] text-slate-600 font-mono flex-shrink-0 z-40">
        <div id="footer-engine-details">NLP Engine: Vector Matching + Custom Lemmatizer v1.4.0</div>
        <div id="footer-latency-details">Matching latency: {latencyMs > 0 ? `${latencyMs}ms` : '< 1ms'}</div>
        <div id="footer-copyright-details" className="text-slate-500">Made with <span className="text-rose-500">♥</span> by <span className="text-slate-300 font-bold">Mamta Sharma</span></div>
      </footer>

      {/* 6. MODAL FOR BULK UPLOAD */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 relative shadow-2xl">
            <button 
              onClick={() => { setShowUploadModal(false); setJsonUploadError(null); }}
              className="absolute right-4 top-4 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            
            <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-300 mb-4 flex items-center gap-2">
              <Upload className="w-4 h-4 text-sky-400" /> Upload FAQ JSON Database
            </h3>
            
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Select or drop a `.json` file containing FAQs. The file must be configured as a JSON list of objects with "question" and "answer" fields:
            </p>

            <pre className="p-3 bg-slate-950 rounded-xl text-[10px] font-mono text-slate-500 border border-slate-900/60 mb-5 overflow-x-auto leading-relaxed">
{`[
  {
    "question": "What is your return policy?",
    "answer": "Returns can be made in 30 days."
  }
]`}
            </pre>

            <div className="space-y-4">
              <div className="border border-dashed border-slate-800 rounded-xl p-6 bg-slate-950/50 hover:bg-slate-950 transition-all text-center relative cursor-pointer group">
                <input 
                  type="file" 
                  accept=".json"
                  onChange={handleJsonUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <FileText className="w-8 h-8 text-slate-600 group-hover:text-sky-500 mx-auto mb-2 transition-colors" />
                <span className="text-xs font-bold text-slate-400 group-hover:text-slate-200 transition-colors">Select FAQ JSON File</span>
                <span className="block text-[10px] text-slate-600 font-mono mt-1">Accepts only valid formatted array files</span>
              </div>

              {jsonUploadError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 font-semibold text-xs leading-relaxed">
                  Error: {jsonUploadError}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
