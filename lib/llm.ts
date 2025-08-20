import { ChatGroq } from "@langchain/groq";

if (!process.env.GROQ_API_KEY) {
  console.warn("GROQ_API_KEY is not set. /api/query will fail for LLM calls.");
}

export const groq = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY!,
  model: "openai/gpt-oss-120b",
  temperature: 0,
});
