export interface Session {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  source?: Source[];
}

export interface Source {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  updatedAt: string;
}

export interface Citation {
  id: string;
  index: number;
  metadata: any;
  sourceId: string;
}

export interface Chat {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  message: string;
  citations?: Citation[];
  createdAt: string;
  updatedAt: string;
}

export interface QueryRequest {
  sessionId: string;
  query: string;
  selectedSources?: string[];
}

export interface StreamEvent {
  type:
    | "searching"
    | "thinking"
    | "generating"
    | "token"
    | "complete"
    | "error";
  content?: string;
  citations?: any[];
  followups?: string[];
  chatMessage?: any;
  userMessageId?: string;
  error?: string;
}

export interface StreamingMessage  {
  id: string;
  content: string;
  isComplete: boolean;
  citations: Citation[];
  followups: string[];
};
