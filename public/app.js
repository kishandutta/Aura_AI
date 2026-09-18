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
        <div class="flex items-center justify-between">
          <span class="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Aura AI</span>
          <!-- Speaker button for Text-to-Speech (44px touch area friendly) -->
          <button
            type="button"
            class="speak-btn text-slate-400 hover:text-sky-300 active:text-sky-200 p-2 sm:p-1.5 rounded-lg hover:bg-white/[0.08] active:bg-white/[0.15] transition-all cursor-pointer border border-transparent touch-press"
            title="Read response aloud (Text-to-Speech)"
          >
            <svg class="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
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
 */
let activeSpeakBtn = null;

function toggleSpeech(text, btn) {
  if (!('speechSynthesis' in window)) {
    alert('Text-to-Speech is not supported by your browser.');
    return;
  }

  // If clicking the same button that is currently playing, stop it
  if (window.speechSynthesis.speaking && activeSpeakBtn === btn) {
    stopSpeechSynthesis();
    return;
  }

  // Cancel any existing speech before starting a new one
  stopSpeechSynthesis();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = navigator.language || 'en-US';
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  activeSpeakBtn = btn;
  btn.classList.add('speaking-active');
  btn.title = "Click to stop speaking";

  utterance.onend = () => {
    stopSpeechSynthesis();
  };

  utterance.onerror = (e) => {
    console.warn('Speech synthesis error:', e);
    stopSpeechSynthesis();
  };

  window.speechSynthesis.speak(utterance);
}

function stopSpeechSynthesis() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  if (activeSpeakBtn) {
    activeSpeakBtn.classList.remove('speaking-active');
    activeSpeakBtn.title = "Read response aloud (Text-to-Speech)";
    activeSpeakBtn = null;
  }
}

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
      <div class="flex items-center justify-between">
        <span class="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Aura AI</span>
        <!-- Speaker button for Text-to-Speech (appears when response completes) -->
        <button
          type="button"
          class="speak-btn hidden text-slate-400 hover:text-sky-300 active:text-sky-200 p-2 sm:p-1.5 rounded-lg hover:bg-white/[0.08] active:bg-white/[0.15] transition-all cursor-pointer border border-transparent touch-press"
          title="Read response aloud (Text-to-Speech)"
        >
          <svg class="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
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
