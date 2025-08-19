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

export interface Chat {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  message: string;
  createdAt: string;
  updatedAt: string;
}
