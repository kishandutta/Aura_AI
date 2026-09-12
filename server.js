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
// 🤖 5. DIRECT GOOGLE GEMINI API INTEGRATION (gemini-flash-latest / fallback)
// ==============================================================================
/**
 * Sends an HTTP POST request to Google Gemini API and returns the plain text response.
 * 
 * @param {string} userPrompt - The message typed by the user
 * @returns {Promise<string>} The conversational response from Gemini
 */
async function sendToGemini(userPrompt) {
  const activeKey = GEMINI_API_KEY ? GEMINI_API_KEY.trim() : "";

  if (!activeKey || activeKey === "PASTE_YOUR_REAL_API_KEY_HERE") {
    throw new Error(
      "Gemini API key is missing! Please open 'server.js' and ensure your key is pasted at line 24."
    );
  }

  // Candidate models in order of priority.
  // If one experiences a temporary spike (503) or 404, the server seamlessly falls back to the next.
  const candidateModels = [
    'gemini-flash-latest',
    'gemini-3.5-flash',
    'gemini-1.5-flash'
  ];

  // System instruction enforcing STRICT conversational response rule
  const systemInstruction = 
    "You are Aura AI, an exceptionally smart, warm, and articulate conversational companion. " +
    "STRICT RULE: Always respond in natural, elegant, human-friendly conversational language. " +
    "Do NOT output random code blocks, backticks, or programming scripts unless the user explicitly requests code.";

  const payload = {
    system_instruction: {
      parts: [
        { text: systemInstruction }
      ]
    },
    contents: [
      {
        parts: [
          { text: userPrompt }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024
    }
  };

  let lastError = null;

  // Try candidate models sequentially
  for (const modelName of candidateModels) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${activeKey}`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const responseData = await response.json().catch(() => ({}));

      // If successful, extract text and return immediately
      if (response.ok) {
        const generatedText = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (generatedText) {
          return generatedText.trim();
        }
      }

      // If this model had high demand (503) or not found (404), record and try next model
      const msg = responseData.error?.message || `HTTP ${response.status}`;
      console.warn(`⚠️ [Model ${modelName} unavailable]: ${msg}. Attempting fallback...`);
      lastError = msg;

    } catch (networkErr) {
      lastError = networkErr.message;
    }
  }

  // If all candidate models failed, throw the last received error
  throw new Error(`Google Gemini Error: ${lastError || 'Unable to generate response at this time.'}`);
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
    serverTime: new Date().toISOString(),
    apiKeyConfigured: isKeyConfigured,
    databaseConnected: isMongoConnected
  });
});

/**
 * PRIMARY CHAT ROUTE: POST /api/chat
 * Receives: { "message": "user question" }
 * Returns:  { "success": true, "reply": "Gemini answer", "savedToDb": boolean }
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;

    // 1. Input Validation
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a non-empty message in your request.'
      });
    }

    const cleanUserPrompt = message.trim();
    console.log(`\n💬 [Incoming User Prompt]: "${cleanUserPrompt.substring(0, 80)}..."`);

    // 2. Direct HTTP call to Google Gemini with automatic fallback
    const aiReply = await sendToGemini(cleanUserPrompt);
    console.log(`✨ [Gemini Response Generated]: "${aiReply.substring(0, 80)}..."`);

    // 3. Save to MongoDB if connected
    let savedToDb = false;
    let savedId = null;
    if (isMongoConnected) {
      try {
        const savedRecord = await Chat.create({
          userPrompt: cleanUserPrompt,
          botResponse: aiReply,
          metadata: {
            model: 'gemini-flash',
            clientIp: req.ip || '127.0.0.1'
          }
        });
        savedToDb = true;
        savedId = savedRecord._id;
      } catch (dbError) {
        console.error('⚠️ [MongoDB Save Failed]:', dbError.message);
      }
    }

    // 4. Send clean conversational response to frontend
    return res.status(200).json({
      success: true,
      reply: aiReply,
      savedToDb: savedToDb,
      chatId: savedId
    });

  } catch (error) {
    // 5. Robust Error Handling: Log the error and return clean JSON to the frontend
    console.error('❌ [Error in /api/chat]:', error.message);

    const isConfigError = error.message.includes('API key is missing');
    const statusCode = isConfigError ? 400 : 500;

    return res.status(statusCode).json({
      success: false,
      error: error.message
    });
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
  console.log(`🔑 [AI Engine]: Google Gemini Flash (Active)`);
  console.log(`🗄️ [Database]: Connecting with Mongoose`);
  console.log('=============================================================\n');
});
