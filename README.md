# 📘 NotebookLM (Custom RAG-Powered Notebook)

An AI-powered document notebook built with **Next.js, LangChain, and Prisma**. Upload documents, add sources, and chat with them using Retrieval-Augmented Generation (RAG).

---

## 🚀 Features

* 📂 **Multi-source ingestion** – Upload **PDF, TXT, CSV**, or provide **URLs** for web crawling & indexing.
* 🔍 **Smart retrieval** – Embeddings-based semantic search across all or selected sources.
* 💬 **Interactive chat** – Ask questions and get contextual answers, citations, and suggested follow-ups.
* ⚡ **Streaming responses** – Real-time AI responses with typing indicators.
* 📑 **Citations & references** – Clickable citations for source traceability.
* 🛠 **Modern stack** – Next.js 15, Prisma + PostgreSQL (pgvector), LangChain, React Query, Tailwind.

---

## 🏗 High-Level Design (HLD)

```
         ┌───────────────┐
         │   Frontend    │
         │ (Next.js App) │
         └───────┬───────┘
                 │
     ┌───────────▼───────────┐
     │     API Layer (app/)   │
     │  - /api/session        │
     │  - /api/sources        │
     │  - /api/chats          │
     │  - /api/query          │
     └───────────┬───────────┘
                 │
     ┌───────────▼───────────┐
     │     Backend Logic      │
     │  - Ingestion (PDF/CSV/URL)
     │  - Embeddings (pgvector)  
     │  - LLM (Groq/Google GenAI)
     │  - Query Processing + RAG  
     └───────────┬───────────┘
                 │
         ┌───────▼────────┐
         │  Database      │
         │ (Postgres +    │
         │   Prisma ORM)  │
         └────────────────┘
```

* **Frontend (React/Next.js)** – Sidebar for sources, chat panel, streaming responses.
* **APIs** – REST endpoints for session mgmt, source ingestion, chat logs, and querying.
* **Vector DB (pgvector)** – Stores embeddings for semantic search.
* **LLM Layer** – Uses LangChain + Groq/Google APIs for query answering.

---

## 🔎 Low-Level Design (LLD)

### Key Components

* **`Sidebar.tsx`** – Manages sources (select all, add new, toggle filters).
* **`ChatPanel.tsx`** – Displays messages, citations, follow-ups, and handles streaming queries.
* **`AddSourceModal.tsx`** – Handles uploads (PDF, TXT, CSV) and web URLs.
* **`useNotebook.ts` (hooks)** – React Query hooks for fetching chats, sessions, and sources.
* **`lib/ingest.ts`** – Parsing & chunking of PDF/CSV/TXT, embeddings creation.
* **`lib/llm.ts`** – LLM client (Groq, Google GenAI).
* **`lib/responseProcessor.ts`** – Enhances answers, formats citations, generates follow-ups.

### Database (Prisma schema)

* **Session** – Represents a notebook.
* **Source** – Uploaded file or URL.
* **SourceChunk** – Chunked embeddings.
* **Chat** – Stores user + assistant messages with citations.

---

## 🔮 Future Scope

* 👤 **Personal Accounts** – Add authentication & multi-user support.
* 🗂 **User-owned Notebooks** – Allow multiple notebooks per user (e.g., "Work", "Research").
* 📝 **Custom prompts** – Users define their own query strategies.
* ☁️ **Cloud Sync** – Store notebooks securely across devices.

---

## ⚡ Getting Started

```bash
# Install dependencies
npm install

# Setup database
npx prisma migrate dev --name init

# Run dev server
npm run dev
```

App will be live at **[https://notebook-lm-r86c.vercel.app/](https://notebook-lm-r86c.vercel.app/)**.
