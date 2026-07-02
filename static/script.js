/**
 * AI FAQ Chatbot - Companion Python/Flask UI script
 */

// Application state
let faqs = [];
let searchHistory = JSON.parse(localStorage.getItem('faq_flask_history') || '[]');
let ttsEnabled = false;
let isListening = false;

// DOM Elements
const tabChatBtn = document.getElementById('tab-chat-btn');
const tabAnalyticsBtn = document.getElementById('tab-analytics-btn');
const tabAdminBtn = document.getElementById('tab-admin-btn');

const viewChat = document.getElementById('view-chat');
const viewAnalytics = document.getElementById('view-analytics');
const viewAdmin = document.getElementById('view-admin');

const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const messageList = document.getElementById('message-list');
const typingIndicator = document.getElementById('typing-indicator');
const micBtn = document.getElementById('mic-btn');
const ttsToggleBtn = document.getElementById('tts-toggle-btn');
const ttsStatus = document.getElementById('tts-status');
const clearChatBtn = document.getElementById('clear-chat-btn');
const exportLogBtn = document.getElementById('export-log-btn');

const gaugeCircle = document.getElementById('gauge-circle');
const gaugePercent = document.getElementById('gauge-percent');
const gaugeRating = document.getElementById('gauge-rating');
const statMatchedText = document.getElementById('stat-matched-text');
const statLatencyText = document.getElementById('stat-latency-text');
const topMatchesBars = document.getElementById('top-matches-bars');
const historyList = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');

// Analytics Elements
const analTotalQueries = document.getElementById('analytics-total-queries');
const analMatchRate = document.getElementById('analytics-match-rate');
const analAvgConfidence = document.getElementById('analytics-avg-confidence');
const analTotalFaqs = document.getElementById('analytics-total-faqs');
const analCategoriesList = document.getElementById('analytics-categories-list');
const analTriggeredList = document.getElementById('analytics-triggered-list');
const analLogTableBody = document.getElementById('analytics-log-table-body');

// Admin Elements
const addFaqForm = document.getElementById('add-faq-form');
const formCategory = document.getElementById('form-category');
const formQuestion = document.getElementById('form-question');
const formAnswer = document.getElementById('form-answer');
const adminSearch = document.getElementById('admin-search');
const adminFaqsList = document.getElementById('admin-faqs-list');
const resetFaqsBtn = document.getElementById('reset-faqs-btn');
const openUploadBtn = document.getElementById('open-upload-btn');
const uploadModal = document.getElementById('upload-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const jsonFileInput = document.getElementById('json-file-input');

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  fetchFaqs();
  renderHistory();
  setupNavigation();
  setupChatHandlers();
  setupSpeechEngines();
  setupAdminAndBulkHandlers();
});

// --- NAVIGATION ---
function setupNavigation() {
  const tabs = [
    { btn: tabChatBtn, view: viewChat },
    { btn: tabAnalyticsBtn, view: viewAnalytics, onActive: updateAnalyticsView },
    { btn: tabAdminBtn, view: viewAdmin, onActive: renderAdminCatalog }
  ];

  tabs.forEach(tab => {
    tab.btn.addEventListener('click', () => {
      // Clear selections
      tabs.forEach(t => {
        t.btn.className = "px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 text-slate-400 hover:text-white hover:bg-slate-900/50 transition-all";
        t.view.classList.add('hidden');
      });

      // Activate clicked
      tab.btn.className = "px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 bg-sky-500 text-slate-950 shadow-md shadow-sky-500/15 transition-all";
      tab.view.classList.remove('hidden');

      if (tab.onActive) tab.onActive();
    });
  });
}

// --- API DATA FETCHING ---
async function fetchFaqs() {
  try {
    const res = await fetch('/api/faqs');
    if (res.ok) {
      faqs = await res.json();
      renderAdminCatalog();
    }
  } catch (err) {
    console.error("Error fetching FAQs:", err);
  }
}

// --- CHAT INTERACTION ENGINE ---
function setupChatHandlers() {
  // Send query
  sendBtn.addEventListener('click', () => submitQuery());
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitQuery();
  });

  // Suggest buttons
  document.querySelectorAll('.suggest-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const qText = btn.querySelector('span').innerText;
      submitQuery(qText);
    });
  });

  // Clear Chat history
  clearChatBtn.addEventListener('click', () => {
    messageList.innerHTML = `
      <div class="flex items-start gap-3.5">
        <div class="w-8 h-8 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 flex items-center justify-center flex-shrink-0">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
        </div>
        <div class="max-w-[75%] flex flex-col">
          <div class="p-4 rounded-2xl rounded-tl-none bg-slate-900/60 border border-slate-900/80 text-slate-300">
            <p class="text-xs sm:text-sm leading-relaxed">Chat terminal cleared. Submit any support question!</p>
          </div>
          <span class="text-[9px] text-slate-600 mt-1.5 font-mono">${getTimestamp()}</span>
        </div>
      </div>
    `;
    updateConfidenceGauge(0, "No Query", "None", "0ms");
    topMatchesBars.innerHTML = `<div class="text-xs text-slate-600 italic">No matches logged.</div>`;
  });

  // Export chat log
  exportLogBtn.addEventListener('click', exportChatTranscript);
  clearHistoryBtn.addEventListener('click', () => {
    searchHistory = [];
    localStorage.setItem('faq_flask_history', '[]');
    renderHistory();
  });
}

async function submitQuery(overrideText = "") {
  const query = (overrideText || chatInput.value).trim();
  if (!query) return;

  chatInput.value = "";
  appendBubble("user", query);
  
  // Show loading indicator
  typingIndicator.classList.remove('hidden');
  messageList.scrollTop = messageList.scrollHeight;

  try {
    const res = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: query })
    });

    typingIndicator.classList.add('hidden');

    if (res.ok) {
      const data = await res.json();
      appendBubble("bot", data.answer, data.confidence, data.matched_question);
      
      // Update UI panels
      updateConfidenceGauge(data.confidence, getRatingLabel(data.confidence), data.matched_question, `${data.latency_ms}ms`);
      updateTopMatches(data.top_matches);
      
      // Store log item
      const logItem = {
        query: query,
        timestamp: getTimestamp(),
        confidence: data.confidence,
        matched: data.matched_question
      };
      searchHistory.unshift(logItem);
      localStorage.setItem('faq_flask_history', JSON.stringify(searchHistory.slice(0, 50)));
      renderHistory();

      if (ttsEnabled) {
        speakText(data.answer);
      }
    } else {
      appendBubble("bot", "Error communicating with server.");
    }
  } catch (err) {
    typingIndicator.classList.add('hidden');
    appendBubble("bot", "Network connection failed.");
  }
}

function appendBubble(sender, text, confidence = null, matched = null) {
  const id = Date.now();
  const card = document.createElement('div');
  card.className = `flex items-start gap-3.5 ${sender === 'user' ? 'flex-row-reverse' : ''}`;
  
  let metricSection = '';
  if (sender === 'bot' && confidence !== null) {
    metricSection = `
      <div class="mt-3.5 p-2 bg-slate-950/80 rounded-xl border border-slate-900 flex flex-wrap gap-2 items-center justify-between">
        <span class="text-[9px] font-mono font-bold text-slate-500">COGNITIVE MATCH: ${confidence}%</span>
        ${matched ? `<span class="text-[9px] font-semibold text-sky-400 max-w-[150px] truncate">"${matched}"</span>` : ''}
        <button class="speak-msg-btn text-[9px] font-bold text-sky-400 hover:underline ml-auto" data-text="${text.replace(/"/g, '&quot;')}">Speak</button>
      </div>
    `;
  }

  card.innerHTML = `
    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 border ${
      sender === 'user' 
        ? 'bg-sky-500/10 border-sky-500/20 text-sky-400' 
        : 'bg-slate-900 border-slate-800 text-slate-300'
    }">
      ${sender === 'user' 
        ? '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>' 
        : '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>'
      }
    </div>
    <div class="max-w-[75%] flex flex-col">
      <div class="p-4 rounded-2xl border ${
        sender === 'user'
          ? 'bg-sky-500/5 border-sky-500/15 rounded-tr-none text-slate-100'
          : 'bg-slate-900/60 border-slate-900/80 rounded-tl-none text-slate-300'
      }">
        <p class="text-xs sm:text-sm leading-relaxed whitespace-pre-line font-medium">${text}</p>
        ${metricSection}
      </div>
      <span class="text-[9px] text-slate-600 mt-1.5 font-mono ${sender === 'user' ? 'text-right' : 'text-left'}">${getTimestamp()}</span>
    </div>
  `;

  messageList.appendChild(card);
  messageList.scrollTop = messageList.scrollHeight;

  // Bind individual speak buttons
  if (sender === 'bot' && confidence !== null) {
    card.querySelector('.speak-msg-btn').addEventListener('click', (e) => {
      speakText(e.target.getAttribute('data-text'));
    });
  }
}

// --- SPEECH RECOGNITION AND SYNTHESIS ---
function setupSpeechEngines() {
  // TTS toggle
  ttsToggleBtn.addEventListener('click', () => {
    ttsEnabled = !ttsEnabled;
    ttsStatus.innerText = ttsEnabled ? "On" : "Off";
    ttsToggleBtn.className = ttsEnabled 
      ? "flex items-center gap-1 text-sky-400 transition-colors" 
      : "flex items-center gap-1 text-slate-500 hover:text-slate-300 transition-colors";
  });

  // Voice Search recognition (Web Speech API)
  micBtn.addEventListener('click', () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice search is not supported in this browser. Try Chrome/Edge!");
      return;
    }

    if (isListening) {
      isListening = false;
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = 'en-US';
    rec.interimResults = false;

    rec.onstart = () => {
      isListening = true;
      micBtn.className = "p-3 rounded-xl border bg-rose-500/20 border-rose-500/40 text-rose-400 animate-pulse";
      chatInput.placeholder = "Listening... Speak now";
    };

    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      chatInput.value = text;
      isListening = false;
      submitQuery(text);
    };

    rec.onerror = () => {
      isListening = false;
    };

    rec.onend = () => {
      isListening = false;
      micBtn.className = "p-3 rounded-xl border bg-slate-950/80 border-slate-900 text-slate-400 hover:text-white transition-all";
      chatInput.placeholder = "Type your support question here...";
    };

    rec.start();
  });
}

function speakText(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 1.0;
  utt.pitch = 1.0;
  window.speechSynthesis.speak(utt);
}

// --- DYNAMIC CONFIDENCE CIRCLE AND SIMILAR MATCHES ---
function updateConfidenceGauge(percent, rating, matched, latency) {
  // SVG circumference: 2 * PI * r = 2 * 3.14159 * 52 = 326.72
  const offset = 326.72 - (326.72 * percent) / 100;
  gaugeCircle.style.strokeDashoffset = offset;
  gaugePercent.innerText = Math.round(percent);
  gaugeRating.innerText = rating;
  
  // Set text colors
  if (percent >= 75) {
    gaugeCircle.setAttribute('class', 'text-emerald-500 transition-all duration-700 ease-out');
    gaugeRating.className = "text-[9px] font-extrabold uppercase font-mono tracking-wider mt-0.5 text-emerald-400";
  } else if (percent >= 40) {
    gaugeCircle.setAttribute('class', 'text-amber-500 transition-all duration-700 ease-out');
    gaugeRating.className = "text-[9px] font-extrabold uppercase font-mono tracking-wider mt-0.5 text-amber-400";
  } else {
    gaugeCircle.setAttribute('class', 'text-rose-500 transition-all duration-700 ease-out');
    gaugeRating.className = "text-[9px] font-extrabold uppercase font-mono tracking-wider mt-0.5 text-rose-400";
  }

  statMatchedText.innerText = matched;
  statMatchedText.title = matched;
  statLatencyText.innerText = latency;
}

function updateTopMatches(matches) {
  if (!matches || matches.length === 0) {
    topMatchesBars.innerHTML = `<div class="text-xs text-slate-600 italic">No matches logged.</div>`;
    return;
  }

  topMatchesBars.innerHTML = matches.map(match => {
    const percent = Math.round(match.similarity * 100);
    const fillClass = percent >= 75 ? 'bg-emerald-500' : percent >= 40 ? 'bg-amber-500' : 'bg-slate-600';
    return `
      <div class="space-y-1.5">
        <div class="flex justify-between text-[11px] font-medium gap-2">
          <span class="text-slate-300 truncate" title="${match.question}">${match.question}</span>
          <span class="font-mono text-slate-500 flex-shrink-0">${percent}%</span>
        </div>
        <div class="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-900">
          <div class="${fillClass} h-full rounded-full transition-all duration-500" style="width: ${percent}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderHistory() {
  if (searchHistory.length === 0) {
    historyList.innerHTML = `<div class="h-full flex flex-col items-center justify-center text-center p-4"><p class="text-xs text-slate-600">No query history yet.</p></div>`;
    return;
  }

  historyList.innerHTML = searchHistory.map(item => {
    const colText = item.confidence >= 75 ? 'text-emerald-400' : item.confidence >= 40 ? 'text-amber-400' : 'text-rose-400';
    return `
      <div class="p-3 rounded-xl bg-slate-950/50 border border-slate-900 text-xs text-slate-300 hover:border-sky-500/40 transition-all cursor-pointer hover:bg-slate-900/20 group" onclick="submitQuery('${item.query.replace(/'/g, "\\'")}')">
        <div class="flex justify-between items-start gap-2">
          <span class="line-clamp-2 leading-relaxed group-hover:text-sky-400">${item.query}</span>
          <span class="text-[9px] text-slate-600 font-mono flex-shrink-0">${item.timestamp}</span>
        </div>
        <div class="mt-1.5 flex justify-between items-center text-[10px]">
          <span class="text-slate-500">Confidence:</span>
          <span class="font-bold font-mono ${colText}">${Math.round(item.confidence)}%</span>
        </div>
      </div>
    `;
  }).join('');
}

// --- ANALYTICS DASHBOARD ENGINE ---
function updateAnalyticsView() {
  const total = searchHistory.length;
  analTotalQueries.innerText = total;
  analTotalFaqs.innerText = faqs.length;

  if (total === 0) {
    analMatchRate.innerText = "0%";
    analAvgConfidence.innerText = "0%";
    analLogTableBody.innerHTML = `<tr><td colSpan="4" class="py-8 text-center text-slate-600">No log files recorded. Submit query first!</td></tr>`;
    analCategoriesList.innerHTML = `<div class="text-xs text-slate-600">No FAQs cataloged.</div>`;
    analTriggeredList.innerHTML = `<div class="text-xs text-slate-600 italic">No triggers recorded.</div>`;
    return;
  }

  const successQueries = searchHistory.filter(h => h.confidence >= 40);
  const successPercent = Math.round((successQueries.length / total) * 100);
  analMatchRate.innerText = `${successPercent}%`;

  const avgConf = Math.round(searchHistory.reduce((acc, h) => acc + h.confidence, 0) / total);
  analAvgConfidence.innerText = `${avgConf}%`;

  // FAQ Categories share
  const catCounts = {};
  faqs.forEach(f => {
    catCounts[f.category || 'General'] = (catCounts[f.category || 'General'] || 0) + 1;
  });

  analCategoriesList.innerHTML = Object.entries(catCounts).map(([cat, count]) => {
    const percent = Math.round((count / faqs.length) * 100);
    return `
      <div class="space-y-1.5">
        <div class="flex justify-between text-xs font-semibold">
          <span class="text-slate-300">${cat}</span>
          <span class="text-slate-500">${count} items (${percent}%)</span>
        </div>
        <div class="w-full bg-slate-950 h-2.5 rounded-full border border-slate-900 overflow-hidden">
          <div class="bg-sky-500 h-full rounded-full transition-all duration-500" style="width: ${percent}%"></div>
        </div>
      </div>
    `;
  }).join('');

  // Top Triggered FAQ List
  const triggeredCounts = {};
  searchHistory.forEach(h => {
    if (h.confidence >= 40 && h.matched !== "None (Below Threshold)") {
      triggeredCounts[h.matched] = (triggeredCounts[h.matched] || 0) + 1;
    }
  });

  const sortedTriggers = Object.entries(triggeredCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (sortedTriggers.length === 0) {
    analTriggeredList.innerHTML = `<div class="text-xs text-slate-600 italic">No successful matches above threshold yet.</div>`;
  } else {
    analTriggeredList.innerHTML = sortedTriggers.map(([question, count]) => `
      <div class="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 border border-slate-900 text-xs text-slate-300">
        <span class="truncate max-w-[80%] font-semibold">"${question}"</span>
        <div class="px-3 py-1 bg-sky-500/10 border border-sky-500/20 rounded-lg text-sky-400 font-extrabold font-mono text-[10px]">
          Hits: ${count}
        </div>
      </div>
    `).join('');
  }

  // Populate analytical Table logs
  analLogTableBody.innerHTML = searchHistory.map(h => {
    const isSuccess = h.confidence >= 40;
    const ratingLabel = isSuccess ? (h.confidence >= 75 ? 'HIGH' : 'MEDIUM') : 'LOW';
    const ratingBg = h.confidence >= 75 
      ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5' 
      : h.confidence >= 40 
        ? 'border-amber-500/30 text-amber-400 bg-amber-500/5' 
        : 'border-rose-500/30 text-rose-400 bg-rose-500/5';
    
    return `
      <tr class="hover:bg-slate-900/20 transition-colors text-slate-300">
        <td class="py-3.5 px-4 font-mono text-slate-500 text-[10px]">${h.timestamp}</td>
        <td class="py-3.5 px-4 font-semibold text-slate-100">${h.query}</td>
        <td class="py-3.5 px-4 text-right font-mono font-bold">${Math.round(h.confidence)}%</td>
        <td class="py-3.5 px-4 text-center">
          <span class="px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold tracking-wider border ${ratingBg}">
            ${ratingLabel}
          </span>
        </td>
      </tr>
    `;
  }).join('');
}

// --- FAQ CATALOG ADMIN PORTAL ---
function renderAdminCatalog() {
  const query = adminSearch.value.toLowerCase().trim();
  const filtered = faqs.filter(f => 
    f.question.toLowerCase().includes(query) || 
    f.answer.toLowerCase().includes(query) ||
    f.category.toLowerCase().includes(query)
  );

  adminFaqsList.innerHTML = filtered.map(f => `
    <div class="p-4 rounded-xl bg-slate-950/50 border border-slate-900 flex flex-col gap-3 relative hover:border-slate-800 transition-all group">
      <div class="flex justify-between items-center gap-3">
        <span class="px-2 py-0.5 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded text-[9px] font-extrabold uppercase font-mono tracking-wider">
          ${f.category}
        </span>
      </div>
      <div class="space-y-2 mt-1">
        <h3 class="text-xs sm:text-sm font-bold text-white">Q: ${f.question}</h3>
        <p class="text-xs text-slate-400 leading-relaxed">A: ${f.answer}</p>
      </div>
    </div>
  `).join('');
}

function setupAdminAndBulkHandlers() {
  // Filter admin Catalog on search input
  adminSearch.addEventListener('input', renderAdminCatalog);

  // Form submission
  addFaqForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = formQuestion.value.trim();
    const a = formAnswer.value.trim();
    const c = formCategory.value;

    if (!q || !a) return;

    try {
      const res = await fetch('/api/faqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, answer: a, category: c })
      });

      if (res.ok) {
        formQuestion.value = "";
        formAnswer.value = "";
        alert("FAQ added and model retrained successfully!");
        fetchFaqs();
      }
    } catch (err) {
      alert("Error saving FAQ.");
    }
  });

  // Bulk Upload Modal triggers
  openUploadBtn.addEventListener('click', () => uploadModal.classList.remove('hidden'));
  closeModalBtn.addEventListener('click', () => uploadModal.classList.add('hidden'));
  
  // JSON File upload Parser
  jsonFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const r = new FileReader();
    r.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (!Array.isArray(parsed)) throw new Error("JSON is not a top-level list.");
        
        // Post each FAQ sequentially or notify user
        for (const item of parsed) {
          if (!item.question || !item.answer) continue;
          await fetch('/api/faqs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              question: item.question, 
              answer: item.answer, 
              category: item.category || 'Uploaded' 
            })
          });
        }
        
        alert("Bulk JSON entries uploaded successfully! Reloading engine...");
        uploadModal.classList.add('hidden');
        fetchFaqs();
      } catch (err) {
        alert("Failed to parse JSON file. Ensure correct schema formats.");
      }
    };
    r.readAsText(file);
  });
}

// --- UTILITIES ---
function getTimestamp() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getRatingLabel(percent) {
  if (percent >= 75) return "High";
  if (percent >= 40) return "Medium";
  return "Low Match";
}

function exportChatTranscript() {
  let log = `AI FAQ CHATBOT TRANSCRIPT\nExport Date: ${new Date().toLocaleDateString()}\n=============================\n\n`;
  const bubbles = messageList.children;
  for (let b of bubbles) {
    const isBot = b.innerHTML.includes('Bot') || b.className.includes('bot') || b.querySelector('svg').outerHTML.includes('9.75');
    const sender = isBot ? "BOT" : "YOU";
    const text = b.querySelector('p').innerText;
    log += `[${sender}]: ${text}\n\n`;
  }

  const blob = new Blob([log], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const l = document.createElement('a');
  l.href = url;
  l.download = `FAQ_Chat_Transcript_${Date.now()}.txt`;
  l.click();
  URL.revokeObjectURL(url);
}
