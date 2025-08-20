"use client";

type Props = {
  onQuestionClick: (question: string) => void;
  disabled?: boolean;
};

const QUICK_QUESTIONS = [
  "What are the main points?",
  "Can you summarize this?",
  "What are the key findings?",
  "How does this relate to my other sources?",
];

export default function QuickActions({ onQuestionClick, disabled }: Props) {
  return (
    <div className="p-4 border-b border-gray-200">
      <div className="text-xs text-gray-500 mb-2 uppercase tracking-wide">
        Quick start
      </div>
      <div className="grid grid-cols-2 gap-2">
        {QUICK_QUESTIONS.map((q, i) => (
          <button
            key={i}
            onClick={() => onQuestionClick(q)}
            disabled={disabled}
            className="p-2 text-xs text-left bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
