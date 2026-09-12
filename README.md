# 🌌 Aura AI — Production Full-Stack Conversational AI Application

A modern, production-ready Full-Stack conversational AI application named **Aura AI**. Built with **Node.js, Express, MongoDB, and Google Gemini API**, featuring an ultra-clean, minimalist interface inspired by Google Gemini and ChatGPT.

---

## 📁 Project Architecture & Folder Structure

```
Aura_AI/
├── .env.example          # Environment variables template (API keys, DB URI)
├── .env                  # Your local configuration file (Ignored by Git)
├── package.json          # Node.js project manifest & dependencies
├── server.js             # Express backend server, API routes & Gemini integration
├── models/
│   └── Chat.js           # Mongoose schema for persistent MongoDB chat history
├── public/
│   ├── index.html        # Ultra-clean minimalist frontend interface
│   ├── style.css         # Glassmorphic aesthetics & subtle ambient lighting
│   └── app.js            # Frontend JavaScript connecting to Express backend
└── README.md             # Complete beginner-friendly setup & architectural guide
```

---

## 🧠 How the Architecture Connects (For Beginners)

Here is how data flows from your screen to the AI and the database:

1. **Frontend (`public/index.html` & `public/app.js`)**:
   - The user opens `http://localhost:3000`.
   - The user types a message and clicks Send.
   - `public/app.js` catches the submit event and fires an asynchronous `fetch('/api/chat', { method: 'POST', body: JSON.stringify({ message: "Hello" }) })`.
   - **Crucial Security Point**: The frontend **never** sees or stores your Gemini API key or Database passwords.

2. **Backend Server (`server.js`)**:
   - Express receives the incoming request at `POST /api/chat`.
   - It reads your secure `GEMINI_API_KEY` from the `.env` file.
   - It attaches a system directive to ensure the AI **only responds in clean, conversational language** without unsolicited code blocks.
   - It contacts Google's Gemini servers via an encrypted server-to-server request.

3. **Database Layer (`models/Chat.js`)**:
   - As soon as Gemini generates the response, Mongoose executes `Chat.create(...)`.
   - The user's query and the AI's reply are saved with an automatic timestamp into MongoDB.
   - When the user refreshes the page, the frontend automatically fetches `GET /api/history` to restore past conversations.

4. **Return to Browser**:
   - Express returns `{ reply: "...", savedToDb: true }` as JSON to the browser.
   - `public/app.js` receives the JSON and smoothly renders the conversation bubble.

---

## 🚀 Getting Started in 3 Simple Steps

### Step 1: Install Dependencies
Open your terminal in the project directory (`c:\Users\kisha\OneDrive\Desktop\Aura_AI`) and run:
```bash
npm install
```
This installs:
- `express` (Backend Web Framework)
- `mongoose` (MongoDB Object Modeling)
- `dotenv` (Loads `.env` environment variables)
- `cors` (Cross-Origin Resource Sharing)

---

### Step 2: Configure Environment Variables (`.env`)
Open the `.env` file in your editor:

1. **Google Gemini API Key**:
   - Visit [Google AI Studio](https://aistudio.google.com/) and click **Get API Key** (it is 100% free).
   - Paste it into `.env`:
     ```env
     GEMINI_API_KEY=AIzaSy...
     ```

2. **MongoDB Connection String (Optional for first run)**:
   - Create a free cloud database cluster on [MongoDB Atlas](https://cloud.mongodb.com/).
   - Copy your connection string into `.env`:
     ```env
     MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/aura_ai?retryWrites=true&w=majority
     ```
   *(Note: If you don't have MongoDB set up yet, Aura AI will still start and chat gracefully, explaining how to connect!)*

---

### Step 3: Launch Aura AI
Start the server:
```bash
npm start
```
Or for development with automatic reload on changes:
```bash
npm run dev
```

Now open your browser and navigate to:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 🛡️ Production Deployment Guide

Aura AI is structured to be deployed directly to cloud platforms:

- **Render / Railway**:
  - Connect your GitHub repository.
  - Set Build Command: `npm install`.
  - Set Start Command: `npm start`.
  - Add `GEMINI_API_KEY` and `MONGODB_URI` in the Environment Variables tab.
- **Vercel / Node Hosting**:
  - Point the entry point to `server.js`.
