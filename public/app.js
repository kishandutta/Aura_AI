/**
 * ==============================================================================
 * AURA AI — FRONTEND JAVASCRIPT: public/app.js
 * ==============================================================================
 * 
 * TUTORIAL EXPLANATION FOR BEGINNERS:
 * ------------------------------------------------------------------------------
 * How Voice Features Work via Browser APIs:
 * 
 * 1. SPEECH-TO-TEXT (Voice Input):
 *    Uses the browser's native `Web Speech API (SpeechRecognition)`.
 *    When you click the microphone button, the browser listens to your microphone,
 *    transcribes your speech in real-time, and inserts the text into the input box.
 * 
 * 2. TEXT-TO-SPEECH (Voice Output):
 *    Uses `window.speechSynthesis` and `SpeechSynthesisUtterance`.
 *    Each response from Aura AI includes a speaker icon. Clicking it reads the
 *    conversational reply aloud with human-like browser voices.
 * 
 * 3. BACKEND COMMUNICATION:
 *    All transcribed and typed text is sent to your Express backend route at
 *    POST `/api/chat`, ensuring your Gemini API key and MongoDB remain secure.
 * ==============================================================================
 */

// Step 1: Cache references to essential HTML elements
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');
const micIcon = document.getElementById('micIcon');
const voiceStatusBanner = document.getElementById('voiceStatusBanner');
const welcomeHero = document.getElementById('welcomeHero');
const chatMessages = document.getElementById('chatMessages');
const typingIndicator = document.getElementById('typingIndicator');
const statusBadge = document.getElementById('statusBadge');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

// Tracks whether the user has sent at least one message in this session
let hasStartedChat = false;

// ==============================================================================
// 🎨 ICONS: CLEAN SVG ICONS FOR TEXT-TO-SPEECH (SPEAKER & STOP STATES)
// ==============================================================================
const TTS_ICONS = {
  speaker: `<svg class="w-4 h-4 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`,
  stop: `<svg class="w-3.5 h-3.5 pointer-events-none" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.5"></rect></svg>`
};

/**
 * ==============================================================================
 * HELPER: SET PROMPT FROM QUICK BUTTONS
 * ==============================================================================
 */
function setPrompt(text) {
  if (!text) return;
  if (sendBtn && sendBtn.disabled) return;
  messageInput.value = text;
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
  messageInput.focus();
  chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
}
// Explicitly expose on window for button click-to-prompt handlers
window.setPrompt = setPrompt;

/**
 * ==============================================================================
 * UI FUNCTION: TRANSITION TO CHAT VIEW
 * ==============================================================================
 */
function showChatView() {
  if (!hasStartedChat) {
    welcomeHero.classList.add('hidden');
    chatMessages.classList.remove('hidden');
    hasStartedChat = true;
  }
}

/**
 * ==============================================================================
 * UI FUNCTION: AUTO-SCROLL CONVERSATION TO BOTTOM
 * ==============================================================================
 */
function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * ==============================================================================
 * UI FUNCTION: APPEND MESSAGE BUBBLE
 * ==============================================================================
 * Creates and renders a message bubble into the conversation stream.
 * For AI responses, embeds a clickable Text-to-Speech speaker button.
 */
function appendMessage(sender, text) {
  showChatView();

  const isUser = sender === 'user';
  const wrapper = document.createElement('div');
  wrapper.className = `flex w-full ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`;

  if (isUser) {
    // User Message Bubble (Mobile-optimized max-width & padding)
    wrapper.innerHTML = `
      <div class="max-w-[88%] sm:max-w-[75%] rounded-2xl rounded-tr-sm bg-gradient-to-r from-sky-500/20 to-indigo-500/20 border border-sky-400/20 px-3.5 sm:px-4 py-2.5 sm:py-3 text-slate-100 text-sm sm:text-base leading-relaxed shadow-sm">
        <p class="whitespace-pre-wrap">${escapeHtml(text)}</p>
      </div>
    `;
  } else {
    // Aura AI Message Bubble with Text-to-Speech Speaker Icon
    const bubbleContainer = document.createElement('div');
    bubbleContainer.className = 'flex gap-2 sm:gap-3 max-w-[95%] sm:max-w-[80%] items-start';

    bubbleContainer.innerHTML = `
      <div class="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-tr from-sky-400 to-purple-500 flex items-center justify-center shrink-0 mt-0.5 shadow-[0_0_10px_rgba(56,189,248,0.3)]">
        <span class="text-white font-bold text-[9px] sm:text-[10px]">A</span>
      </div>
      <div class="flex-1 space-y-1 sm:space-y-1.5 min-w-0">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Aura AI</span>
          <!-- Speaker button for Text-to-Speech -->
          <button
            type="button"
            class="speak-btn touch-press"
            title="Read response aloud"
            aria-label="Read response aloud"
          >
            ${TTS_ICONS.speaker}
          </button>
        </div>
        <div class="text-slate-200 text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words">${escapeHtml(text)}</div>
      </div>
    `;

    // Attach click listener to speaker button
    const speakBtn = bubbleContainer.querySelector('.speak-btn');
    if (speakBtn) {
      speakBtn.addEventListener('click', () => {
        toggleSpeech(text, speakBtn);
      });
    }

    wrapper.appendChild(bubbleContainer);
  }

  chatMessages.appendChild(wrapper);
  scrollToBottom();
}

/**
 * ==============================================================================
 * SECURITY HELPER: ESCAPE HTML STRINGS
 * ==============================================================================
 */
function escapeHtml(string) {
  if (!string) return '';
  return String(string)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * ==============================================================================
 * 🎙️ SPEECH-TO-TEXT WITH AUTOMATIC SILENCE DETECTION & AUTO-SEND
 * ==============================================================================
 * When the user speaks, the engine transcribes their voice live.
 * When it detects a 1.4-second pause in speech or the session ends, it
 * automatically submits the transcribed prompt to the chat without needing
 * the user to click the send button!
 */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;
let silenceTimer = null;
let finalRecordedText = '';
const SILENCE_TIMEOUT_MS = 1400; // 1.4 seconds of silence triggers automatic submission

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = true; // Continuous listening so pauses between words don't close the session
  recognition.interimResults = true; // Stream words live into the textarea
  recognition.lang = navigator.language || 'en-US';

  // Triggered when microphone starts listening
  recognition.onstart = () => {
    isListening = true;
    finalRecordedText = '';
    micBtn.classList.add('mic-active');
    micBtn.title = "Listening... speak now (click to submit)";
    voiceStatusBanner.classList.remove('hidden');
    const statusTextEl = document.getElementById('voiceStatusText');
    if (statusTextEl) statusTextEl.textContent = "Listening... speak now (auto-sends on pause)";
    messageInput.placeholder = "Listening... speak now...";
  };

  // Triggered as words are recognized in real time
  recognition.onresult = (event) => {
    let interimText = '';
    let completedText = '';

    for (let i = 0; i < event.results.length; i++) {
      const res = event.results[i];
      if (res.isFinal) {
        completedText += res[0].transcript + ' ';
      } else {
        interimText += res[0].transcript;
      }
    }

    finalRecordedText = (completedText + interimText).trim();

    if (finalRecordedText) {
      messageInput.value = finalRecordedText;
      // Auto-grow textarea to fit content
      messageInput.style.height = 'auto';
      messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';

      // Reset the silence countdown timer on every recognized word
      clearTimeout(silenceTimer);

      // Auto-dispatch after 1.4 seconds of silence!
      silenceTimer = setTimeout(() => {
        if (isListening && messageInput.value.trim()) {
          console.log('🎙️ [Voice Input]: Natural pause detected. Auto-submitting to Aura AI...');
          autoSubmitVoiceMessage();
        }
      }, SILENCE_TIMEOUT_MS);
    }
  };

  // Handle errors (e.g. microphone permission denied)
  recognition.onerror = (event) => {
    console.warn('Speech recognition error:', event.error);
    clearTimeout(silenceTimer);
    if (event.error === 'not-allowed') {
      alert('Microphone permission was denied. Please allow microphone access in your browser address bar.');
    }
    stopVoiceRecognition(false);
  };

  // Triggered when recognition engine session closes
  recognition.onend = () => {
    clearTimeout(silenceTimer);
    // If the engine closed naturally and there is text that hasn't been sent yet, auto-send it!
    if (isListening && messageInput.value.trim()) {
      autoSubmitVoiceMessage();
    } else {
      stopVoiceRecognition(false);
    }
  };
}

/**
 * Automatically dispatches the voice message without requiring manual click
 */
function autoSubmitVoiceMessage() {
  clearTimeout(silenceTimer);
  const textToSend = messageInput.value.trim();

  // Reset listening state
  stopVoiceRecognition(false);

  if (textToSend) {
    // Clear input field
    messageInput.value = '';
    messageInput.style.height = '44px';

    // Dispatch directly to backend chat
    sendMessageToServer(textToSend);
  }
}

/**
 * Handle user clicking the "Send Now" button on the banner
 */
function handleVoiceBannerAction() {
  if (messageInput.value.trim()) {
    autoSubmitVoiceMessage();
  } else {
    stopVoiceRecognition(false);
  }
}

function toggleVoiceRecognition() {
  if (!recognition) {
    alert('Speech recognition is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Safari.');
    return;
  }

  // Stop any active text-to-speech audio when user begins talking
  stopSpeechSynthesis();

  if (isListening) {
    // If user clicked mic while speaking and text is present, submit immediately!
    if (messageInput.value.trim()) {
      autoSubmitVoiceMessage();
    } else {
      stopVoiceRecognition(false);
    }
  } else {
    try {
      finalRecordedText = '';
      clearTimeout(silenceTimer);
      recognition.start();
    } catch (err) {
      console.warn('Error starting speech recognition:', err);
    }
  }
}

function stopVoiceRecognition(shouldSend = false) {
  clearTimeout(silenceTimer);
  isListening = false;

  if (recognition) {
    try {
      recognition.stop();
    } catch (e) {}
  }

  micBtn.classList.remove('mic-active');
  micBtn.title = "Voice Input (Speech-to-Text)";
  voiceStatusBanner.classList.add('hidden');
  messageInput.placeholder = "Ask Aura AI, or tap mic to speak...";

  if (shouldSend && messageInput.value.trim()) {
    autoSubmitVoiceMessage();
  }
}


/**
 * ==============================================================================
 * 🔊 TEXT-TO-SPEECH (VOICE OUTPUT VIA WEB SPEECH API)
 * ==============================================================================
 * Production-grade Speech Synthesis controller:
 * - Strips markdown symbols, code tags, and URLs for natural voice pronunciation
 * - Toggles between playing (Stop icon) and idle (Speaker icon)
 * - Safe cancellation of ongoing speech sessions before initiating new speech
 * - Fixes Chrome 15-second pause freeze with an interval keep-alive heartbeat
 * - Keeps global reference to SpeechSynthesisUtterance to prevent V8 garbage collection
 * - Handles asynchronous voice list loading across Chrome, Android, Edge, & Safari
 */
let activeSpeakBtn = null;
let currentUtterance = null;
let keepAliveTimer = null;
let cachedVoices = [];

// Initialize voices with async event listener for Chrome/Android/Safari
function initVoices() {
  if (!('speechSynthesis' in window)) return;
  cachedVoices = window.speechSynthesis.getVoices() || [];
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = () => {
      cachedVoices = window.speechSynthesis.getVoices() || [];
    };
  }
  if (typeof window.speechSynthesis.addEventListener === 'function') {
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      cachedVoices = window.speechSynthesis.getVoices() || [];
    });
  }
}
initVoices();

/**
 * Automatically detects language & script from text:
 * 1. Hindi (Devanagari script: /[\u0900-\u097F]/) -> 'hi-IN'
 * 2. Bengali script (/[\u0980-\u09FF]/) -> 'bn-IN'
 * 3. Additional Indic & international scripts (Tamil, Telugu, Urdu, Japanese, Chinese, etc.)
 * 4. Browser Language Detector API (if supported)
 * 5. Default / Latin / English -> 'en-US'
 *
 * @param {string} text
 * @returns {Promise<string>} BCP-47 language tag
 */
async function detectLanguage(text) {
  if (!text || typeof text !== 'string') return 'en-US';

  // 1. Hindi (Devanagari script: U+0900 to U+097F)
  if (/[\u0900-\u097F]/.test(text)) {
    return 'hi-IN';
  }

  // 2. Bengali script (U+0980 to U+09FF)
  if (/[\u0980-\u09FF]/.test(text)) {
    return 'bn-IN';
  }

  // 3. Other Indic scripts
  if (/[\u0B80-\u0BFF]/.test(text)) return 'ta-IN'; // Tamil
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te-IN'; // Telugu
  if (/[\u0A80-\u0AFF]/.test(text)) return 'gu-IN'; // Gujarati
  if (/[\u0C80-\u0CFF]/.test(text)) return 'kn-IN'; // Kannada
  if (/[\u0D00-\u0D7F]/.test(text)) return 'ml-IN'; // Malayalam
  if (/[\u0A00-\u0A7F]/.test(text)) return 'pa-IN'; // Punjabi
  if (/[\u0B00-\u0B7F]/.test(text)) return 'or-IN'; // Odia

  // 4. International scripts
  if (/[\u0600-\u06FF]/.test(text)) return 'ur-PK'; // Urdu / Arabic
  if (/[\u3040-\u30FF]/.test(text)) return 'ja-JP'; // Japanese
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh-CN'; // Chinese
  if (/[\uAC00-\uD7AF]/.test(text)) return 'ko-KR'; // Korean
  if (/[\u0400-\u04FF]/.test(text)) return 'ru-RU'; // Cyrillic

  // 5. Browser Language Detector API check (Chrome/Edge AI API)
  if (typeof window !== 'undefined' && window.ai?.languageDetector) {
    try {
      const capabilities = await window.ai.languageDetector.capabilities?.();
      if (capabilities && capabilities.available !== 'no') {
        const detector = await window.ai.languageDetector.create();
        const results = await detector.detect(text);
        if (results && results.length > 0 && results[0].confidence > 0.5) {
          const detected = results[0].detectedLanguage;
          const bcp47Map = {
            'hi': 'hi-IN', 'bn': 'bn-IN', 'en': 'en-US', 'es': 'es-ES',
            'fr': 'fr-FR', 'de': 'de-DE', 'it': 'it-IT', 'pt': 'pt-BR',
            'ja': 'ja-JP', 'zh': 'zh-CN', 'ko': 'ko-KR', 'ru': 'ru-RU',
            'ar': 'ar-SA'
          };
          return bcp47Map[detected] || detected;
        }
      }
    } catch (_) {
      // Gracefully continue to fallback
    }
  }

  // 6. Default fallback: Latin / English
  return 'en-US';
}

/**
 * Searches and selects a matching voice whose 'lang' or 'name' matches the detected language.
 * If a specific regional voice is not found on the client device, returns null so the
 * browser's native fallback synthesis engine can pronounce the native script via utterance.lang.
 *
 * @param {string} detectedLang - BCP-47 tag (e.g. 'hi-IN', 'bn-IN', 'en-US')
 * @returns {SpeechSynthesisVoice|null}
 */
function findMatchingVoice(detectedLang) {
  if (!('speechSynthesis' in window)) return null;

  // Refresh voices immediately from window.speechSynthesis
  let voices = window.speechSynthesis.getVoices() || [];
  if (voices.length > 0) {
    cachedVoices = voices;
  } else if (cachedVoices && cachedVoices.length > 0) {
    voices = cachedVoices;
  }
  if (!voices || voices.length === 0) return null;

  const targetLang = (detectedLang || 'en-US').toLowerCase().replace('_', '-');
  const primaryLang = targetLang.split('-')[0];

  // Specific keyword mappings for voice search
  const langNameKeywords = {
    'hi': ['hindi', 'hi-in', 'hi_in', 'india', 'lekha', 'kalpana', 'hemant'],
    'bn': ['bengali', 'bangla', 'bn-in', 'bn-bd', 'bn_in', 'bn_bd', 'bashkar', 'tanishaa'],
    'ta': ['tamil', 'ta-in'],
    'te': ['telugu', 'te-in'],
    'gu': ['gujarati', 'gu-in'],
    'kn': ['kannada', 'kn-in'],
    'ml': ['malayalam', 'ml-in'],
    'pa': ['punjabi', 'pa-in'],
    'ur': ['urdu', 'ur-pk', 'ur-in'],
    'ja': ['japanese', 'ja-jp'],
    'zh': ['chinese', 'mandarin', 'zh-cn'],
    'ko': ['korean', 'ko-kr'],
    'es': ['spanish', 'es-es', 'es-mx'],
    'fr': ['french', 'fr-fr'],
    'de': ['german', 'de-de'],
    'ru': ['russian', 'ru-ru']
  };

  // 1. Exact match on BCP-47 tag (e.g. 'hi-in', 'bn-in', 'en-us')
  const exactMatch = voices.find(v => {
    const vLang = (v.lang || '').toLowerCase().replace('_', '-');
    return vLang === targetLang;
  });
  if (exactMatch) return exactMatch;

  // 2. Prefix match on voice.lang (e.g. 'hi' matches 'hi-IN', 'bn' matches 'bn-BD')
  const prefixMatch = voices.find(v => {
    const vLang = (v.lang || '').toLowerCase().replace('_', '-');
    return vLang.startsWith(primaryLang + '-') || vLang === primaryLang;
  });
  if (prefixMatch) return prefixMatch;

  // 3. Search voice.name or voice.voiceURI for matching keywords (e.g. 'Hindi', 'Bengali')
  const keywords = langNameKeywords[primaryLang] || [primaryLang];
  const nameMatch = voices.find(v => {
    const vName = (v.name || '').toLowerCase();
    const vUri = (v.voiceURI || '').toLowerCase();
    return keywords.some(kw => vName.includes(kw) || vUri.includes(kw));
  });
  if (nameMatch) return nameMatch;

  // 4. For English, pick highest-quality natural voice or default
  if (primaryLang === 'en') {
    const preferredEnglishVoices = [
      'google us english',
      'google uk english female',
      'natural',
      'samantha',
      'microsoft jenny online',
      'microsoft guy online',
      'microsoft zira',
      'microsoft david'
    ];
    for (const kw of preferredEnglishVoices) {
      const match = voices.find(v => {
        const vName = (v.name || '').toLowerCase();
        const vUri = (v.voiceURI || '').toLowerCase();
        return vName.includes(kw) || vUri.includes(kw);
      });
      if (match) return match;
    }
    const englishFallback = voices.find(v => (v.lang || '').toLowerCase().startsWith('en'));
    if (englishFallback) return englishFallback;
    return voices.find(v => v.default) || voices[0] || null;
  }

  // 5. If specific regional voice is not found on client device, return null
  // so browser fallback synthesis engine can use utterance.lang directly!
  return null;
}

// Alias for backwards compatibility
function getBestVoice(lang = 'en-US') {
  return findMatchingVoice(lang);
}

/**
 * Pre-processes text to ensure clean, natural pronunciation:
 * Removes markdown formatting, code blocks, bullet syntax, and raw URLs.
 */
function cleanTextForSpeech(text) {
  if (!text) return '';
  return text
    // Replace multi-line code blocks ``` ... ``` with friendly note
    .replace(/```[\s\S]*?```/g, ' Code snippet omitted. ')
    // Replace inline code `...`
    .replace(/`([^`]+)`/g, '$1')
    // Convert markdown links [Text](url) to Text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove bold and italics formatting (**bold**, *italic*, __bold__)
    .replace(/[*_~]{1,3}(.*?)[*_~]{1,3}/g, '$1')
    // Remove headers (# Header)
    .replace(/^#{1,6}\s+/gm, '')
    // Remove blockquote markers (> Quote)
    .replace(/^>\s+/gm, '')
    // Remove bullet points and numbered list symbols
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // Clean URLs
    .replace(/https?:\/\/\S+/g, 'link')
    // Collapse excess whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Toggles speech synthesis on/off for a given text and button element.
 * Accurately speaks any detected language (Hindi, Bengali, English, etc.).
 */
async function toggleSpeech(text, btn) {
  if (!('speechSynthesis' in window)) {
    alert('Text-to-Speech is not supported by your browser. Please use Chrome, Edge, or Safari.');
    return;
  }

  // If clicking the same button that is currently speaking, stop and reset
  if (activeSpeakBtn === btn && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) {
    stopSpeechSynthesis();
    return;
  }

  // Cancel any prior speech across any bubble before starting anew
  stopSpeechSynthesis();

  const speechText = cleanTextForSpeech(text);
  if (!speechText) return;

  // Clear stuck audio queues and resume if paused
  window.speechSynthesis.cancel();
  if (window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
  }

  // 1. Automatic Language & Script Detection
  const detectedLang = await detectLanguage(speechText);

  // 2. Dynamic Voice Matching & Utterance setup
  const utterance = new SpeechSynthesisUtterance(speechText);
  currentUtterance = utterance; // Retain reference to prevent V8 garbage collection drop

  // Always ensure utterance.lang is assigned correctly
  utterance.lang = detectedLang;

  // Search and select matching voice
  const matchingVoice = findMatchingVoice(detectedLang);
  if (matchingVoice) {
    utterance.voice = matchingVoice;
    if (matchingVoice.lang) {
      utterance.lang = matchingVoice.lang;
    }
  }

  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  // Activate UI state: show Stop icon and pulse animation
  activeSpeakBtn = btn;
  btn.classList.add('speaking-active');
  btn.innerHTML = TTS_ICONS.stop;
  btn.title = "Stop reading aloud";
  btn.setAttribute('aria-label', "Stop reading aloud");

  // Keep-alive timer for Chrome 15s pause bug on long utterances
  clearInterval(keepAliveTimer);
  keepAliveTimer = setInterval(() => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    } else {
      clearInterval(keepAliveTimer);
    }
  }, 10000);

  utterance.onend = () => {
    stopSpeechSynthesis();
  };

  utterance.onerror = (event) => {
    if (event.error !== 'canceled' && event.error !== 'interrupted') {
      console.warn('Speech synthesis notice:', event.error);
    }
    stopSpeechSynthesis();
  };

  // 3. Reliable Speech Playback: Clear queues and resume immediately before speak()
  try {
    window.speechSynthesis.cancel();
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    window.speechSynthesis.speak(utterance);
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  } catch (err) {
    console.warn('Speech synthesis playback error:', err);
    stopSpeechSynthesis();
  }
}

/**
 * Halts active speech synthesis immediately and resets all button UI states.
 */
function stopSpeechSynthesis() {
  clearInterval(keepAliveTimer);
  keepAliveTimer = null;

  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }

  if (activeSpeakBtn) {
    activeSpeakBtn.classList.remove('speaking-active');
    activeSpeakBtn.innerHTML = TTS_ICONS.speaker;
    activeSpeakBtn.title = "Read response aloud";
    activeSpeakBtn.setAttribute('aria-label', "Read response aloud");
    activeSpeakBtn = null;
  }

  currentUtterance = null;
}

// Clean up any ongoing speech synthesis if user navigates away or refreshes
window.addEventListener('beforeunload', () => {
  stopSpeechSynthesis();
});

/**
 * ==============================================================================
 * UI HELPER: CREATE STREAMING BOT MESSAGE BUBBLE
 * ==============================================================================
 * Creates an interactive message bubble that updates smoothly as tokens stream
 * from Google Gemini API via Server-Sent Events.
 */
function createStreamingBotBubble() {
  showChatView();

  const wrapper = document.createElement('div');
  wrapper.className = 'flex w-full justify-start animate-fade-in';

  const bubbleContainer = document.createElement('div');
  bubbleContainer.className = 'flex gap-2 sm:gap-3 max-w-[95%] sm:max-w-[80%] items-start';

  bubbleContainer.innerHTML = `
    <div class="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-tr from-sky-400 to-purple-500 flex items-center justify-center shrink-0 mt-0.5 shadow-[0_0_10px_rgba(56,189,248,0.3)]">
      <span class="text-white font-bold text-[9px] sm:text-[10px]">A</span>
    </div>
    <div class="flex-1 space-y-1 sm:space-y-1.5 min-w-0">
      <div class="flex items-center justify-between gap-2">
        <span class="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Aura AI</span>
        <!-- Speaker button for Text-to-Speech (appears when response completes) -->
        <button
          type="button"
          class="speak-btn hidden"
          title="Read response aloud"
          aria-label="Read response aloud"
        >
          ${TTS_ICONS.speaker}
        </button>
      </div>
      <div class="text-content text-slate-200 text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words"></div>
    </div>
  `;

  wrapper.appendChild(bubbleContainer);
  chatMessages.appendChild(wrapper);
  scrollToBottom();

  const textEl = bubbleContainer.querySelector('.text-content');
  const speakBtn = bubbleContainer.querySelector('.speak-btn');
  let accumulatedText = '';
  let isFinalized = false;

  return {
    appendChunk(chunk) {
      accumulatedText += chunk;
      textEl.textContent = accumulatedText;
      scrollToBottom();
    },
    finalize() {
      if (isFinalized) return;
      isFinalized = true;
      if (accumulatedText.trim() && speakBtn) {
        speakBtn.classList.remove('hidden');
        speakBtn.innerHTML = TTS_ICONS.speaker;
        speakBtn.title = "Read response aloud";
        speakBtn.setAttribute('aria-label', "Read response aloud");
        speakBtn.addEventListener('click', () => {
          toggleSpeech(accumulatedText, speakBtn);
        });
      }
    },
    setError(errorMessage) {
      accumulatedText = errorMessage;
      textEl.innerHTML = `<span class="text-rose-400">${escapeHtml(errorMessage)}</span>`;
      scrollToBottom();
    },
    getText() {
      return accumulatedText;
    }
  };
}

/**
 * ==============================================================================
 * CORE FUNCTION: SEND MESSAGE TO BACKEND SERVER (REAL-TIME STREAMING)
 * ==============================================================================
 * Dispatches prompt to Express backend and streams incoming tokens via generateContentStream.
 */
async function sendMessageToServer(userText) {
  // Stop any active speech recognition or speech output
  stopVoiceRecognition();
  stopSpeechSynthesis();

  // Step 1: Render the user message immediately in the UI
  appendMessage('user', userText);

  // Step 2: Show typing indicator & disable send button while connecting
  typingIndicator.classList.remove('hidden');
  sendBtn.disabled = true;
  scrollToBottom();

  let botStream = null;

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({ message: userText, stream: true })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server responded with status ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream') && response.body) {
      // Create streaming response bubble and hide typing indicator immediately
      botStream = createStreamingBotBubble();
      typingIndicator.classList.add('hidden');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Preserve incomplete trailing chunk

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const dataPayload = trimmed.slice(6);
            if (!dataPayload) continue;

            try {
              const parsed = JSON.parse(dataPayload);
              if (parsed.text) {
                botStream.appendChunk(parsed.text);
              }
              if (parsed.error) {
                botStream.setError(`I encountered an issue: ${parsed.error}`);
              }
              if (parsed.done) {
                botStream.finalize();
              }
            } catch (jsonErr) {
              // Ignore partial JSON in stream buffer
            }
          }
        }
      }

      // Ensure bubble is finalized once stream fully ends
      botStream.finalize();

    } else {
      // Fallback for non-streaming responses
      const data = await response.json();
      typingIndicator.classList.add('hidden');
      appendMessage('bot', data.reply);
    }

  } catch (error) {
    console.error('Error contacting backend server:', error);
    typingIndicator.classList.add('hidden');
    if (botStream && botStream.getText()) {
      botStream.setError(`${botStream.getText()}\n\n[Connection Notice: ${error.message}]`);
    } else {
      appendMessage('bot', `I encountered an issue connecting to the server: ${error.message}`);
    }
  } finally {
    // Step 4: Clean up indicator and re-enable send button
    typingIndicator.classList.add('hidden');
    sendBtn.disabled = false;
    messageInput.focus();
  }
}

/**
 * ==============================================================================
 * INITIALIZATION: LOAD PAST CHAT HISTORY (MONGODB)
 * ==============================================================================
 */
async function loadChatHistory() {
  try {
    const res = await fetch('/api/history');
    if (!res.ok) return;

    const data = await res.json();
    if (data.success && Array.isArray(data.history) && data.history.length > 0) {
      console.log(`Loaded ${data.history.length} past messages from MongoDB.`);
      data.history.forEach(item => {
        appendMessage('user', item.userPrompt);
        appendMessage('bot', item.botResponse);
      });
    }
  } catch (err) {
    console.log('No previous history loaded or MongoDB offline:', err.message);
  }
}

/**
 * ==============================================================================
 * INITIALIZATION: CHECK SERVER HEALTH
 * ==============================================================================
 */
async function checkServerHealth() {
  try {
    const res = await fetch('/api/health');
    if (res.ok) {
      const data = await res.json();
      if (data.databaseConnected) {
        statusText.textContent = 'Aura Online • DB Connected';
        statusDot.className = 'w-2 h-2 rounded-full bg-emerald-400';
      } else {
        statusText.textContent = 'Aura Online';
        statusDot.className = 'w-2 h-2 rounded-full bg-sky-400';
      }
    }
  } catch (e) {
    statusText.textContent = 'Server Offline';
    statusDot.className = 'w-2 h-2 rounded-full bg-rose-400';
  }
}

/**
 * ==============================================================================
 * EVENT LISTENERS SETUP
 * ==============================================================================
 */
document.addEventListener('DOMContentLoaded', () => {
  // Check health and load MongoDB history
  checkServerHealth();
  loadChatHistory();

  // Voice Input (Microphone Button) click handler
  if (micBtn) {
    micBtn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleVoiceRecognition();
    });
  }

  // Auto-resize textarea as user types
  messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
  });

  // Handle Enter key (Shift+Enter for newline, Enter to send)
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatForm.dispatchEvent(new Event('submit'));
    }
  });

  // Handle form submission
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const prompt = messageInput.value.trim();
    if (!prompt) return;

    // Clear input field and reset height
    messageInput.value = '';
    messageInput.style.height = '44px';

    // Dispatch message to backend
    sendMessageToServer(prompt);
  });
});
