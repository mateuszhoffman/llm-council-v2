
export enum AgentRole {
  OPTIMIST = 'OPTIMIST',
  SKEPTIC = 'SKEPTIC',
  REALIST = 'REALIST',
  VISIONARY = 'VISIONARY',
  HISTORIAN = 'HISTORIAN',
  SCIENTIST = 'SCIENTIST',
  MODERATOR = 'MODERATOR',
  ETHICIST = 'ETHICIST',
  ECONOMIST = 'ECONOMIST',
  GUEST = 'GUEST_EXPERT'
}

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  systemPrompt: string;
  avatarColor: string;
  description: string;
  modelOverride?: string; // Feature: Per-agent model config
}

export interface SavedCouncil {
  id: string;
  name: string; // e.g., "Sci-Fi Writers", "Board of Directors"
  agents: Agent[];
  lastModified: number;
}

export interface Fallacy {
  name: string;
  reason: string;
  severity: 'minor' | 'major';
}

export interface Message {
  id: string;
  agentId: string;
  content: string;
  timestamp: number;
  type: 'text' | 'research' | 'vote' | 'error';
  citations?: { title: string; uri: string }[];
  phase?: DebatePhase;
  isGuest?: boolean;
  guestRole?: string;
  fallacy?: Fallacy;
}

export enum DebatePhase {
  SETUP = 'SETUP',
  OPENING = 'OPENING',
  REBUTTAL = 'REBUTTAL',
  SYNTHESIS = 'SYNTHESIS',
  VOTING = 'VOTING',
  VERDICT = 'VERDICT',
  USER_INPUT = 'USER_INPUT',
}

export interface Vote {
  voterId: string;
  targetAgentId: string;
  score: number;
  reason: string;
}

export interface FinalVerdict {
  winnerId: string;
  summary: string;
  keyTakeaways: string[];
  votes: Vote[];
}

export type DebateMode = 'FIXED' | 'AUTO';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalCost: number; // Estimated in USD
}

export interface ContextDocument {
    id: string;
    content: string;
    timestamp: number;
}

export interface DebateState {
  topic: string;
  mode: DebateMode;
  maxRounds: number; // If fixed
  currentRound: number;
  phase: DebatePhase;
  currentTurnAgentId: string | null;
  transcript: Message[];
  isThinking: boolean;
  thinkingAgentId: string | null;
  pendingUserQuestion: string | null;
  finalVerdict?: FinalVerdict;
  tokenUsage: TokenUsage;
  userRequestedStop: boolean;
  showConsultationPrompt: boolean;
  summonedGuest?: {
      name: string;
      role: string;
      reason: string;
  } | null;
  contextDocuments: ContextDocument[]; // Feature: Research Injection
}

export type ToolResponseResolver = (response: string) => void;

export type LLMProvider = 'GOOGLE' | 'OPENROUTER';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey?: string; // For Google override
  openRouterApiKey?: string;
  perplexityApiKey?: string; // Feature: Perplexity Search
  modelId: string; // e.g. 'gemini-3-flash-preview' or 'anthropic/claude-3-opus'
}

export interface OpenRouterModel {
  id: string;
  name: string;
  pricing: {
    prompt: string;
    completion: string;
  };
  context_length: number;
}
