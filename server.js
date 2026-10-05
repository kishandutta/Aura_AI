/**
 * ==============================================================================
 * AURA AI — PRODUCTION BACKEND SERVER: server.js
 * ==============================================================================
 * 
 * TUTORIAL EXPLANATION FOR BEGINNERS:
 * ------------------------------------------------------------------------------
 * This file is your backend server. It runs on your computer using Node.js and
 * the Express framework.
 * 
 * Responsibilities:
 * 1. Listen for requests from your frontend (web page).
 * 2. Connect to MongoDB using Mongoose to save chats permanently.
 * 3. Directly send user messages to Google Gemini API (gemini-flash-latest).
 * 4. Extract the clean text reply from Gemini and send it back to the browser.
 * 5. Handle all errors gracefully so the server NEVER crashes.
 * ==============================================================================
 */

require('dotenv').config();

// ==============================================================================
// 🔑 1. CONFIGURATION: API KEYS & DATABASE URI
// ==============================================================================
// Reads from .env file, or you can paste your key below directly:
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "PASTE_YOUR_REAL_API_KEY_HERE";

// Reads from .env file, or you can paste your MongoDB URI below directly:
const MONGODB_URI = process.env.MONGODB_URI || "PASTE_YOUR_MONGODB_URI_HERE";

// Port for your web server (3000 is standard for local development)
const PORT = process.env.PORT || 3000;

// ==============================================================================
// 📦 2. CORE MODULE IMPORTS & DNS FIX FOR WINDOWS
// ==============================================================================
const express = require('express');
const cors = require('cors');
const path = require('path');
const dns = require('dns');
const mongoose = require('mongoose');

// Use reliable Google DNS resolvers to prevent Windows SRV lookup failures (querySrv ECONNREFUSED)
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (dnsErr) {
  // Fallback to default if restricted
}

// Import the Mongoose Chat Model to store conversations in MongoDB
const Chat = require('./models/Chat');

// Import Mammoth to extract readable text from DOCX documents
const mammoth = require('mammoth');

// Initialize the Express application
const app = express();

// ==============================================================================
// ⚙️ 3. MIDDLEWARE SETUP
// ==============================================================================
// Enable CORS so the browser can freely communicate with this backend
app.use(cors());

// Automatically parse JSON bodies with 50mb limit to support high-res images and documents
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve all frontend files (HTML, CSS, JavaScript) from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// ==============================================================================
// 🗄️ 4. DATABASE CONNECTION LOGIC (MONGODB & MONGOOSE)
// ==============================================================================
let isMongoConnected = false;

async function connectDatabase() {
  if (!MONGODB_URI || MONGODB_URI.includes('PASTE_YOUR_MONGODB_URI_HERE')) {
    console.log('ℹ️  [MongoDB Notice]: MONGODB_URI is using the default placeholder.');
    console.log('ℹ️  Aura AI will still work! To permanently save chat history, paste your MongoDB URI at line 28 of server.js.');
    return;
  }

  try {
    console.log('⏳ [MongoDB]: Connecting to MongoDB Atlas cluster...');
    await mongoose.connect(MONGODB_URI, {
      dbName: 'aura_ai',
      serverSelectionTimeoutMS: 6000
    });
    isMongoConnected = true;
    console.log('✅ [MongoDB]: Successfully connected to database (db: aura_ai).');
  } catch (error) {
    console.error('⚠️  [MongoDB Connection Notice]: Could not complete connection:', error.message);
    console.log('\n-------------------------------------------------------------');
    console.log('💡 [HOW TO FIX MONGODB ATLAS IP WHITELIST]:');
    console.log('1. Log into https://cloud.mongodb.com/');
    console.log('2. In the left sidebar, click "Network Access" under Security.');
    console.log('3. Click "Add IP Address".');
    console.log('4. Click "ALLOW ACCESS FROM ANYWHERE" (0.0.0.0/0) and click Confirm.');
    console.log('5. MongoDB will take ~30 seconds to update, then restart your server.');
    console.log('-------------------------------------------------------------\n');
    console.log('ℹ️  Aura AI is still running smoothly! Real-time chats work via Gemini.\n');
  }
}

// Initiate database connection
connectDatabase();

// ==============================================================================
// 📦 4.5 GOOGLE GENERATIVE AI SDK & STREAMING CONFIGURATION
// ==============================================================================
const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Retrieves the last 4 to 6 conversation turns from MongoDB to provide context
 * while trimming historical context to keep latency ultra-low and eliminate thinking delays.
 * 
 * @param {number} maxTurns - Maximum number of past conversation turns to fetch (default: 5)
 * @returns {Promise<Array<{ role: string, parts: Array<{ text: string }> }>>}
 */
async function getTrimmedChatHistory(maxTurns = 5) {
  if (!isMongoConnected) {
    return [];
  }

  try {
    // Fetch only the most recent N turns from MongoDB (4 to 6 turns)
    const recentChats = await Chat.find()
      .sort({ createdAt: -1 })
      .limit(maxTurns)
      .lean();

    // Reverse to chronological order (oldest to newest)
    const chronological = recentChats.reverse();

    // Map each turn into Gemini contents format with alternating user and model roles
    const historyContents = [];
    for (const turn of chronological) {
      if (turn.userPrompt && turn.botResponse) {
        historyContents.push({
          role: 'user',
          parts: [{ text: turn.userPrompt }]
        });
        historyContents.push({
          role: 'model',
          parts: [{ text: turn.botResponse }]
        });
      }
    }

    return historyContents;
  } catch (err) {
    console.warn('⚠️ [MongoDB History Handler]: Could not load history context:', err.message);
    return [];
  }
}

/**
 * Initiates streaming response from Google Gemini API using generateContentStream.
 * Prioritizes 'gemini-1.5-flash' for ultra-fast latency, with graceful fallback.
 * 
 * @param {Array} contents - The trimmed conversation history plus the new user prompt
 * @returns {Promise<{ stream: AsyncIterable<any>, modelUsed: string }>}
 */
async function generateGeminiStream(contents) {
  const activeKey = GEMINI_API_KEY ? GEMINI_API_KEY.trim() : "";

  if (!activeKey || activeKey === "PASTE_YOUR_REAL_API_KEY_HERE") {
    throw new Error(
      "Gemini API key is missing! Please configure GEMINI_API_KEY in your .env file."
    );
  }

  const genAI = new GoogleGenerativeAI(activeKey);

  // Candidate models prioritized for ultra-fast response speed:
  // Prioritizes gemini-1.5-flash as requested, with resilient fallbacks for 503/404
  const candidateModels = [
    'gemini-1.5-flash',
    'gemini-flash-lite-latest',
    'gemini-flash-latest',
    'gemini-2.5-flash',
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite'
  ];

  const systemInstruction = 
    "You are Aura AI, an exceptionally smart, warm, and articulate conversational companion. " +
    "STRICT RULE: Always respond in natural, elegant, human-friendly conversational language. " +
    "When images or documents are provided, analyze them thoroughly, describe key elements, and answer questions accurately. " +
    "Do NOT output random code blocks, backticks, or programming scripts unless the user explicitly requests code.";

  let lastError = null;

  for (const modelName of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemInstruction,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024
        }
      });

      const responseStream = await model.generateContentStream({ contents });
      return { stream: responseStream.stream, modelUsed: modelName };
    } catch (err) {
      console.warn(`⚠️ [Model ${modelName} stream error]: ${err.message}. Trying next candidate...`);
      lastError = err.message;
    }
  }

  throw new Error(`Google Gemini Error: ${lastError || 'Unable to generate response stream.'}`);
}

/**
 * ==============================================================================
 * 📦 5. MULTIMODAL ATTACHMENT PROCESSOR
 * ==============================================================================
 * Converts attached photos (base64 inlineData) and documents (PDF, TXT, DOC, DOCX)
 * into Google Gemini API compatible content parts.
 * 
 * @param {Array<Object>} attachments
 * @returns {Promise<Array<Object>>}
 */
async function processAttachmentsToParts(attachments) {
  const parts = [];
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return parts;
  }

  for (const att of attachments) {
    if (!att) continue;
    const name = (att.name || 'attachment').trim();
    const rawMime = (att.type || '').toLowerCase();
    const rawData = att.data ? String(att.data).replace(/^data:[^;]+;base64,/, '').trim() : '';

    const isImage = rawMime.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(name);
    const isPdf = rawMime === 'application/pdf' || /\.pdf$/i.test(name);
    const isWordDoc = rawMime.includes('word') || rawMime.includes('officedocument') || /\.(docx|doc)$/i.test(name);
    const isText = rawMime.startsWith('text/') || /\.(txt|md|csv|json|js|ts|py|html|css|xml|log)$/i.test(name);

    if (isImage && rawData) {
      const mimeType = rawMime.startsWith('image/') ? rawMime : 'image/jpeg';
      parts.push({
        inlineData: {
          mimeType,
          data: rawData
        }
      });
    } else if (isPdf && rawData) {
      parts.push({
        inlineData: {
          mimeType: 'application/pdf',
          data: rawData
        }
      });
    } else if (isWordDoc) {
      let docText = (att.textContent || '').trim();
      if (!docText && rawData) {
        try {
          const docBuffer = Buffer.from(rawData, 'base64');
          const mammothResult = await mammoth.extractRawText({ buffer: docBuffer });
          docText = (mammothResult.value || '').trim();
        } catch (docxErr) {
          console.warn(`⚠️ [Mammoth docx parse notice for ${name}]:`, docxErr.message);
          // Fallback: extract printable strings from buffer
          const bufferStr = Buffer.from(rawData, 'base64').toString('binary');
          const printable = bufferStr.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ');
          docText = printable.replace(/\s+/g, ' ').substring(0, 15000).trim();
        }
      }
      if (docText) {
        parts.push({
          text: `[Attached Document: "${name}"]\n${docText}\n[End of "${name}"]`
        });
      }
    } else if (isText) {
      let text = (att.textContent || '').trim();
      if (!text && rawData) {
        try {
          text = Buffer.from(rawData, 'base64').toString('utf-8').trim();
        } catch (e) {
          text = '';
        }
      }
      if (text) {
        parts.push({
          text: `[Attached Document: "${name}"]\n${text}\n[End of "${name}"]`
        });
      }
    } else if (rawData) {
      // General fallback
      parts.push({
        inlineData: {
          mimeType: rawMime || 'application/octet-stream',
          data: rawData
        }
      });
    }
  }

  return parts;
}

// ==============================================================================
// 🛣️ 6. API ROUTES
// ==============================================================================

/**
 * HEALTH CHECK ROUTE: GET /api/health
 * Verifies server status, Gemini key status, and MongoDB connection.
 */
app.get('/api/health', (req, res) => {
  const isKeyConfigured = Boolean(
    GEMINI_API_KEY && 
    GEMINI_API_KEY !== "PASTE_YOUR_REAL_API_KEY_HERE"
  );

  res.json({
    status: 'online',
    model: 'gemini-1.5-flash',
    serverTime: new Date().toISOString(),
    apiKeyConfigured: isKeyConfigured,
    databaseConnected: isMongoConnected
  });
});

/**
 * PRIMARY CHAT ROUTE: POST /api/chat
 * Receives: { "message": "user question", "attachments": [...], "stream": true }
 * Supports real-time Server-Sent Events (SSE) streaming via generateContentStream,
 * multimodal inlineData image and document processing, and falls back to standard JSON.
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { message, attachments = [], stream = true } = req.body;

    const hasMessage = message && typeof message === 'string' && message.trim().length > 0;
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

    // 1. Input Validation
    if (!hasMessage && !hasAttachments) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a message or attach a file or photo to analyze.'
      });
    }

    const cleanUserPrompt = hasMessage ? message.trim() : '';
    console.log(`\n💬 [Incoming User Request]: "${cleanUserPrompt.substring(0, 80)}..." (${attachments.length} attachment(s))`);

    // 2. Process multimodal attachments into Gemini parts (images, PDF, DOCX/DOC, TXT)
    const attachmentParts = await processAttachmentsToParts(attachments);

    // 3. Assemble the user's turn parts
    const userParts = [...attachmentParts];
    if (cleanUserPrompt) {
      userParts.push({ text: cleanUserPrompt });
    } else {
      userParts.push({
        text: 'Please carefully analyze the attached file(s) and provide a comprehensive overview, key insights, and answer any questions.'
      });
    }

    // 4. Fetch trimmed conversation history from MongoDB (last 4 to 6 turns)
    const historyContents = await getTrimmedChatHistory(5);
    const fullContents = [
      ...historyContents,
      { role: 'user', parts: userParts }
    ];

    const isStream = stream !== false && req.headers.accept !== 'application/json';

    // Summary representation of prompt for storage
    const promptSummary = cleanUserPrompt || (hasAttachments 
      ? `[Analyzed ${attachments.length} file(s): ${attachments.map(a => a.name).join(', ')}]`
      : 'Multimodal Attachment Analysis');

    const sanitizedAttachments = (attachments || []).map(a => ({
      name: a.name || 'unnamed',
      type: a.type || 'unknown',
      size: a.size || 0
    }));

    if (isStream) {
      // 5. Setup Server-Sent Events (SSE) headers for real-time token streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (res.flushHeaders) res.flushHeaders();

      let fullAiReply = '';
      let activeModel = 'gemini-1.5-flash';

      try {
        const streamResult = await generateGeminiStream(fullContents);
        activeModel = streamResult.modelUsed;

        for await (const chunk of streamResult.stream) {
          const chunkText = chunk.text();
          if (chunkText) {
            fullAiReply += chunkText;
            res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
          }
        }

        console.log(`✨ [Gemini Stream Completed via ${activeModel}]: "${fullAiReply.substring(0, 80)}..."`);

        // Save conversation turn to MongoDB if connected
        let savedToDb = false;
        let savedId = null;
        if (isMongoConnected && fullAiReply.trim()) {
          try {
            const savedRecord = await Chat.create({
              userPrompt: promptSummary,
              botResponse: fullAiReply.trim(),
              attachments: sanitizedAttachments,
              metadata: {
                model: activeModel,
                clientIp: req.ip || '127.0.0.1'
              }
            });
            savedToDb = true;
            savedId = savedRecord._id;
          } catch (dbError) {
            console.error('⚠️ [MongoDB Save Failed]:', dbError.message);
          }
        }

        // Notify client that stream is complete
        res.write(`data: ${JSON.stringify({ done: true, model: activeModel, savedToDb, chatId: savedId })}\n\n`);
        res.end();

      } catch (streamErr) {
        console.error('❌ [Streaming Error in /api/chat]:', streamErr.message);
        res.write(`data: ${JSON.stringify({ error: streamErr.message })}\n\n`);
        res.end();
      }

    } else {
      // Non-streaming fallback
      const streamResult = await generateGeminiStream(fullContents);
      let fullAiReply = '';
      for await (const chunk of streamResult.stream) {
        fullAiReply += chunk.text();
      }

      let savedToDb = false;
      let savedId = null;
      if (isMongoConnected && fullAiReply.trim()) {
        try {
          const savedRecord = await Chat.create({
            userPrompt: promptSummary,
            botResponse: fullAiReply.trim(),
            attachments: sanitizedAttachments,
            metadata: {
              model: streamResult.modelUsed,
              clientIp: req.ip || '127.0.0.1'
            }
          });
          savedToDb = true;
          savedId = savedRecord._id;
        } catch (dbError) {
          console.error('⚠️ [MongoDB Save Failed]:', dbError.message);
        }
      }

      return res.status(200).json({
        success: true,
        reply: fullAiReply.trim(),
        model: streamResult.modelUsed,
        savedToDb,
        chatId: savedId
      });
    }

  } catch (error) {
    console.error('❌ [Error in /api/chat]:', error.message);

    const isConfigError = error.message.includes('API key is missing');
    const statusCode = isConfigError ? 400 : 500;

    if (!res.headersSent) {
      return res.status(statusCode).json({
        success: false,
        error: error.message
      });
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
});

/**
 * HISTORY ROUTE: GET /api/history
 * Loads the latest 20 past conversations from MongoDB if connected.
 */
app.get('/api/history', async (req, res) => {
  try {
    if (!isMongoConnected) {
      return res.json({ success: true, history: [] });
    }

    const chats = await Chat.find()
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    return res.json({
      success: true,
      history: chats.reverse()
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * CATCH-ALL ROUTE: Sends public/index.html for any frontend navigation
 */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==============================================================================
// 🚀 7. START SERVER
// ==============================================================================
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n=============================================================');
  console.log(`🚀 [Aura AI Backend]: Running smoothly on http://localhost:${PORT}`);
  console.log(`🔑 [AI Engine]: Google Gemini 1.5 Flash (Streaming Active)`);
  console.log(`🗄️ [Database]: Connecting with Mongoose`);
  console.log('=============================================================\n');
});
