// lib/responseProcessor.ts
export function formatResponse(rawAnswer: string): string {
  // Remove redundant phrases
  const cleanAnswer = rawAnswer
    .replace(/^(Well,|So,|Basically,|In essence,|To summarize,)\s*/i, "")
    .replace(/\s+(As mentioned earlier|As I mentioned|Like I said)\s+/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Ensure proper paragraph structure
  const sentences = cleanAnswer.split(/(?<=[.!?])\s+/);
  const formattedSentences: string[] = [];

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim();
    if (sentence) {
      // Start new paragraph every 3-4 sentences
      if (i > 0 && i % 3 === 0 && !sentence.match(/^[•\-\d]/)) {
        formattedSentences.push("\n\n" + sentence);
      } else {
        formattedSentences.push(sentence);
      }
    }
  }

  return formattedSentences.join(" ");
}

export function generateContextualFollowups(
  query: string,
  context: string
): string[] {
  // Generate more specific followups based on query type
  const queryLower = query.toLowerCase();

  if (queryLower.includes("how")) {
    return [
      `What are the steps for ${extractMainTopic(query)}?`,
      `What tools are needed for this process?`,
      `What are common challenges with this approach?`,
    ];
  }

  if (queryLower.includes("what")) {
    return [
      `How does ${extractMainTopic(query)} work?`,
      `What are the benefits and drawbacks?`,
      `Show me examples from the sources`,
    ];
  }

  if (queryLower.includes("why")) {
    return [
      `What are alternatives to ${extractMainTopic(query)}?`,
      `What evidence supports this?`,
      `How does this compare to other approaches?`,
    ];
  }

  return [
    `Tell me more about this topic`,
    `What related information is available?`,
    `How can I apply this knowledge?`,
  ];
}

function extractMainTopic(query: string): string {
  // Simple extraction - you can make this more sophisticated
  const words = query.toLowerCase().split(" ");
  const stopWords = new Set([
    "what",
    "how",
    "why",
    "when",
    "where",
    "is",
    "are",
    "the",
    "a",
    "an",
  ]);
  return words
    .filter((w) => !stopWords.has(w))
    .slice(0, 2)
    .join(" ");
}
