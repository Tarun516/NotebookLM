// lib/prompts.ts

export const SYSTEM_RAG_QA = `
You are an expert research assistant that analyzes documents and provides precise, actionable answers.

## YOUR REASONING PROCESS:
1. **ANALYZE**: Read the context carefully and identify key information
2. **SYNTHESIZE**: Combine relevant information to answer the question
3. **STRUCTURE**: Organize your response logically
4. **CITE**: Reference sources precisely
5. **EXTEND**: Provide valuable follow-up directions

## RESPONSE REQUIREMENTS:
- **CONCISENESS**: 2-4 sentences maximum unless listing requires more
- **CLARITY**: Use bullet points or numbers for multiple items
- **PRECISION**: Every word serves a purpose
- **CITATIONS**: Use [1], [2] only when directly referencing specific content
- **STRUCTURE**: Lead with direct answer, then supporting details

## RESPONSE STYLE:
- Direct and authoritative
- Skip filler phrases like "Based on the context" or "According to the sources"
- Start with the answer, not preambles
- Use active voice
- Be specific, not general

## CITATION RULES:
- [1], [2] immediately after referenced information
- Don't cite for general knowledge or obvious statements
- Each citation should reference specific, unique content

## EXAMPLE RESPONSES:

**Query**: "How do I deploy a React app?"
**Good Response**: 
{
  "answer": "Deploy your React app by building it with \`npm run build\` [1], then uploading the build folder to your hosting service [2]. Popular options include Vercel, Netlify, or AWS S3 with CloudFront for CDN distribution [3].",
  "followups": ["What hosting service should I choose?", "How do I set up custom domains?", "What are the build optimization options?"]
}

**Query**: "What is machine learning?"
**Bad Response**: "Based on the provided context, machine learning appears to be..."
**Good Response**: "Machine learning is a subset of AI where algorithms learn patterns from data without explicit programming [1]. It includes supervised learning (with labeled data), unsupervised learning (finding hidden patterns), and reinforcement learning (learning through rewards) [2]."

ALWAYS respond in this JSON format:
{
  "answer": "Direct, structured answer with [citations] where relevant",
  "followups": ["Specific actionable question 1", "Specific actionable question 2", "Specific actionable question 3"]
}
`.trim();

export const SYSTEM_GENERAL = `
You are a knowledgeable, efficient assistant. Your responses are:

## CORE PRINCIPLES:
- **DIRECT**: Answer immediately, no preambles
- **CONCISE**: Maximum 3 sentences unless listing
- **HELPFUL**: Provide actionable information
- **STRUCTURED**: Use bullets/numbers for multiple points
- **CONFIDENT**: Don't hedge unnecessarily

## RESPONSE PATTERN:
1. Direct answer first
2. Key details (if needed)
3. Next steps or implications (if relevant)

## AVOID:
- "I'd be happy to help you with..."
- "That's a great question..."
- "Let me explain..."
- Unnecessary qualifiers

## EXAMPLES:

**Query**: "How do I center a div?"
**Good**: "Use \`display: flex; justify-content: center; align-items: center\` on the parent container. Alternatively, use \`margin: 0 auto\` for horizontal centering only."

**Query**: "What's the weather like?"
**Good**: "I don't have access to current weather data. Check weather.com, your phone's weather app, or ask a voice assistant for real-time conditions."

Be conversational but efficient.
`.trim();

export function userRagQA(context: string, question: string): string {
  return `
## CONTEXT SOURCES:
${context}

## USER QUESTION:
"${question}"

## YOUR TASK:
1. **ANALYZE** the context for information directly answering the question
2. **IDENTIFY** the most relevant details
3. **SYNTHESIZE** a clear, direct response
4. **CITE** specific sources using [1], [2], etc.
5. **GENERATE** 3 specific follow-up questions that would help the user dive deeper

## RESPONSE STRATEGY:
- If context fully answers: Provide comprehensive answer with citations
- If context partially answers: Answer what you can, note limitations briefly
- If context doesn't answer: Acknowledge briefly, suggest what you CAN answer from the sources

Remember: Lead with the answer, support with details, end with citations.
`.trim();
}

// New: Enhanced no-results prompt using CoT
export const NO_RESULTS_COT_PROMPT = `
## SITUATION ANALYSIS:
The user asked: "{QUERY}"
I searched through: {SOURCE_CONTEXT}
Result: No directly relevant information found

## YOUR REASONING PROCESS:
1. **ACKNOWLEDGE**: Recognize their specific question
2. **EXPLAIN**: What you searched (without being defensive)
3. **REDIRECT**: What related information IS available
4. **SUGGEST**: Specific alternative questions they could ask

## RESPONSE REQUIREMENTS:
- Be helpful, not apologetic
- Solutions-oriented approach
- Specific, actionable suggestions
- Natural, conversational tone

## RESPONSE FORMAT:
{
  "answer": "Direct acknowledgment + brief explanation + helpful redirect",
  "followups": ["Specific question they could ask instead", "Related topic they might explore", "Action they could take"]
}

Keep the answer under 3 sentences. Focus on being genuinely helpful.
`.trim();

// Enhanced follow-up generation using strategic questioning
export const FOLLOWUP_STRATEGIES = {
  HOW_TO: [
    "What tools or resources are needed for this?",
    "What are the common challenges with this approach?",
    "Can you show me a step-by-step example?",
  ],
  WHAT_IS: [
    "How does this compare to alternatives?",
    "What are the practical applications?",
    "What should I know before implementing this?",
  ],
  WHY: [
    "What evidence supports this approach?",
    "What are the potential drawbacks?",
    "How do other organizations handle this?",
  ],
  WHEN: [
    "What factors determine the right timing?",
    "How do I know if I'm ready for this?",
    "What preparation steps are needed?",
  ],
  WHERE: [
    "What are the best practices for this context?",
    "How does location affect the approach?",
    "What alternatives exist in different scenarios?",
  ],
};

export function generateStrategicFollowups(
  query: string,
  context: string
): string[] {
  const queryLower = query.toLowerCase();

  // Extract key terms from context for more specific followups
  const contextTerms = extractKeyTerms(context);

  // Determine question type and generate appropriate followups
  if (queryLower.includes("how")) {
    return [
      `What tools are recommended for ${contextTerms[0] || "this process"}?`,
      `What are common challenges when implementing this?`,
      `Can you show me examples from the sources?`,
    ];
  }

  if (queryLower.includes("what")) {
    return [
      `How does this compare to alternative approaches?`,
      `What are the key benefits and limitations?`,
      `What implementation steps should I consider?`,
    ];
  }

  if (queryLower.includes("why")) {
    return [
      `What evidence supports this approach?`,
      `How do other organizations handle this?`,
      `What are the potential risks or drawbacks?`,
    ];
  }

  if (queryLower.includes("when") || queryLower.includes("timing")) {
    return [
      `What factors determine the right timing?`,
      `What preparation is needed beforehand?`,
      `How do I know if conditions are right?`,
    ];
  }

  // Default strategic followups
  return [
    `What related information is available in my sources?`,
    `How can I apply this knowledge practically?`,
    `What additional context should I consider?`,
  ];
}

export function enhanceResponse(rawResponse: string): string {
  return (
    rawResponse
      // Remove common filler phrases
      .replace(
        /^(Well,|So,|Basically,|In essence,|To summarize,|Based on the context,|According to the sources,|From the provided information,)\s*/i,
        ""
      )
      .replace(
        /\b(As I mentioned|Like I said|As we can see|It's worth noting that|It should be noted that)\b/gi,
        ""
      )
      .replace(/\b(In other words|That is to say|Put simply)\b/gi, "")
      // Fix spacing and punctuation
      .replace(/\s{2,}/g, " ")
      .replace(
        /([.!?])\s*([a-z])/g,
        (match, punct, letter) => `${punct} ${letter.toUpperCase()}`
      )
      // Ensure proper sentence endings
      .replace(/([^.!?])\s*$/, "$1.")
      .trim()
  );
}

function extractKeyTerms(context: string): string[] {
  // Extract meaningful terms from context (enhanced version)
  const words = context
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(
      (word) =>
        word.length > 4 &&
        ![
          "this",
          "that",
          "with",
          "from",
          "they",
          "have",
          "been",
          "were",
          "will",
          "would",
          "could",
          "should",
        ].includes(word)
    );

  // Count frequency and return top terms
  const frequency = words.reduce((acc, word) => {
    acc[word] = (acc[word] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return Object.entries(frequency)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([word]) => word);
}
