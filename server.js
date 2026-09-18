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

// Initialize the Express application
const app = express();

// ==============================================================================
// ⚙️ 3. MIDDLEWARE SETUP
// ==============================================================================
// Enable CORS so the browser can freely communicate with this backend
app.use(cors());

// Automatically parse JSON bodies in incoming requests (e.g. { message: "Hello" })
app.use(express.json());

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
    'gemini-3.5-flash-lite'
  ];

  const systemInstruction = 
    "You are Aura AI, an exceptionally smart, warm, and articulate conversational companion. " +
    "STRICT RULE: Always respond in natural, elegant, human-friendly conversational language. " +
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
 * Receives: { "message": "user question", "stream": true }
 * Supports real-time Server-Sent Events (SSE) streaming via generateContentStream,
 * and falls back to standard JSON when requested.
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { message, stream = true } = req.body;

    // 1. Input Validation
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a non-empty message in your request.'
      });
    }

    const cleanUserPrompt = message.trim();
    console.log(`\n💬 [Incoming User Prompt]: "${cleanUserPrompt.substring(0, 80)}..."`);

    // 2. Fetch trimmed conversation history from MongoDB (last 4 to 6 turns)
    const historyContents = await getTrimmedChatHistory(5);
    const fullContents = [
      ...historyContents,
      { role: 'user', parts: [{ text: cleanUserPrompt }] }
    ];

    const isStream = stream !== false && req.headers.accept !== 'application/json';

    if (isStream) {
      // 3. Setup Server-Sent Events (SSE) headers for real-time token streaming
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
              userPrompt: cleanUserPrompt,
              botResponse: fullAiReply.trim(),
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
            userPrompt: cleanUserPrompt,
            botResponse: fullAiReply.trim(),
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
