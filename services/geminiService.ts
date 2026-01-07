import { GoogleGenAI, Tool, FunctionDeclaration, Type, Schema, GenerateContentResponse } from "@google/genai";
import { Message, DebatePhase, Vote, Agent, FinalVerdict, AgentRole, Fallacy, LLMConfig, LLMProvider, OpenRouterModel, ContextDocument } from '../types';

// --- Configuration State ---
let currentConfig: LLMConfig = {
    provider: 'GOOGLE',
    modelId: 'gemini-3-flash-preview'
};

// Pricing cache for OpenRouter models
let openRouterPricing: Record<string, { prompt: number, completion: number }> = {};

export const setLLMConfig = (config: LLMConfig) => {
    currentConfig = { ...config };
};

export const getOpenRouterModels = async (apiKey: string): Promise<OpenRouterModel[]> => {
    try {
        const response = await fetch("https://openrouter.ai/api/v1/models", {
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            }
        });
        if (!response.ok) throw new Error("Failed to fetch OpenRouter models");
        const data = await response.json();
        
        // Cache pricing
        data.data.forEach((m: any) => {
            openRouterPricing[m.id] = {
                prompt: parseFloat(m.pricing?.prompt || '0'),
                completion: parseFloat(m.pricing?.completion || '0')
            };
        });

        return data.data.map((m: any) => ({
            id: m.id,
            name: m.name,
            pricing: m.pricing,
            context_length: m.context_length
        })).sort((a: OpenRouterModel, b: OpenRouterModel) => a.name.localeCompare(b.name));
    } catch (e) {
        console.error(e);
        return [];
    }
};

const getClient = () => {
  const apiKey = currentConfig.apiKey || process.env.API_KEY;
  if (!apiKey) throw new Error("Google API Key not found");
  return new GoogleGenAI({ apiKey });
};

// Pricing Constants (Default Google)
const PRICE_INPUT_1M = 0.075;
const PRICE_OUTPUT_1M = 0.30;
const PRICE_SEARCH_REQUEST = 0.035;

// Perplexity Pricing (sonar-pro usually)
const PRICE_PERPLEXITY_REQUEST = 0.005; // Simplified estimate per search call

export const getEstimatedPricing = (modelId: string) => {
    if (currentConfig.provider === 'OPENROUTER' && openRouterPricing[modelId]) {
        return openRouterPricing[modelId];
    }
    // Fallback/Google defaults
    return { prompt: PRICE_INPUT_1M / 1_000_000, completion: PRICE_OUTPUT_1M / 1_000_000 };
};

const calculateCost = (usage: any, searchQueries: number = 0, perplexityCalls: number = 0): number => {
    if (!usage) return 0;
    
    const input = usage.promptTokenCount || usage.prompt_tokens || 0;
    const output = usage.candidatesTokenCount || usage.completion_tokens || 0;
    
    let inputPrice = PRICE_INPUT_1M;
    let outputPrice = PRICE_OUTPUT_1M;

    // Use OpenRouter pricing if applicable
    if (currentConfig.provider === 'OPENROUTER' && openRouterPricing[currentConfig.modelId]) {
        const p = openRouterPricing[currentConfig.modelId];
        // OpenRouter pricing is usually per 1 token in the cache map? 
        // Let's verify: usually pricing API returns cost per 1M or 1K. 
        // The getOpenRouterModels logic parses them. 
        // Assuming OpenRouter API returns '0.000001' type strings per token.
        return (input * p.prompt) + (output * p.completion) + (perplexityCalls * PRICE_PERPLEXITY_REQUEST);
    } 
    
    // Google Pricing Logic
    const tokenCost = (input / 1_000_000 * inputPrice) + (output / 1_000_000 * outputPrice);
    const searchCost = searchQueries * PRICE_SEARCH_REQUEST;
    const pplxCost = perplexityCalls * PRICE_PERPLEXITY_REQUEST;
    
    return tokenCost + searchCost + pplxCost;
};

// --- Tool Definitions ---

const askUserFunction: FunctionDeclaration = {
  name: 'askUser',
  description: 'Ask the human user a clarifying question. The question MUST be in the same language as the debate topic.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      question: {
        type: Type.STRING,
        description: 'The question to ask the user.',
      },
    },
    required: ['question'],
  },
};

const searchWebFunction: FunctionDeclaration = {
    name: 'search_web',
    description: 'Search the internet for real-time facts, news, or statistics to verify arguments.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            query: {
                type: Type.STRING,
                description: 'The search query to execute.',
            }
        },
        required: ['query']
    }
};

// Retry Helper
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- Perplexity Service ---
export const performPerplexitySearch = async (query: string): Promise<{ text: string, citations: any[] }> => {
    if (!currentConfig.perplexityApiKey) {
        return { text: "Error: Perplexity API Key not configured.", citations: [] };
    }

    try {
        const response = await fetch("https://api.perplexity.ai/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${currentConfig.perplexityApiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "sonar", // High speed, good for search grounding
                messages: [
                    { role: "system", content: "You are a search engine. Return a concise summary of facts with citations." },
                    { role: "user", content: query }
                ]
            })
        });

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "No results found.";
        const citations = data.citations?.map((uri: string) => ({ title: 'Source', uri })) || [];

        return { text: content, citations };
    } catch (e) {
        console.error("Perplexity Search Error", e);
        return { text: "Failed to perform search.", citations: [] };
    }
};

// --- Generic LLM Caller ---

interface GenericResponse {
    text: string;
    citations?: { title: string; uri: string }[];
    toolCall?: { name: string; args: any; id: string };
    usage: any;
    searchQueries: number;
}

async function callOpenRouter(
    model: string,
    prompt: string,
    systemInstruction?: string,
    tools?: any[],
    jsonSchema?: any
): Promise<GenericResponse> {
    const apiKey = currentConfig.openRouterApiKey;
    if (!apiKey) throw new Error("OpenRouter API Key not found");

    const messages: any[] = [];
    if (systemInstruction) {
        messages.push({ role: 'system', content: systemInstruction });
    }
    messages.push({ role: 'user', content: prompt });

    // Map Tools (Gemini to OpenAI format)
    let openAiTools = undefined;
    if (tools && tools.length > 0) {
        // Only map functionDeclarations (OpenRouter doesn't support Google Search tool natively this way)
        const functionDecls = tools.flatMap(t => t.functionDeclarations || []);
        if (functionDecls.length > 0) {
            openAiTools = functionDecls.map((fn: any) => ({
                type: 'function',
                function: {
                    name: fn.name,
                    description: fn.description,
                    parameters: {
                        type: 'object',
                        properties: fn.parameters.properties,
                        required: fn.parameters.required
                    }
                }
            }));
        }
    }

    const body: any = {
        model: model,
        messages: messages,
        tools: openAiTools,
    };

    if (jsonSchema) {
        body.response_format = { type: "json_object" };
        if (!systemInstruction?.toLowerCase().includes('json')) {
             messages[0].content += " You must respond with valid JSON.";
        }
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "HTTP-Referer": typeof window !== 'undefined' ? window.location.origin : "https://llmcouncil.app",
            "X-Title": "LLM Council",
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenRouter Error: ${err}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const message = choice?.message;
    const toolCalls = message?.tool_calls;

    let toolCallResult = undefined;
    if (toolCalls && toolCalls.length > 0) {
        const tc = toolCalls[0];
        toolCallResult = {
            name: tc.function.name,
            args: JSON.parse(tc.function.arguments),
            id: tc.id
        };
    }

    return {
        text: message?.content || "",
        citations: [], 
        toolCall: toolCallResult,
        usage: data.usage,
        searchQueries: 0
    };
}

async function generateContentWithRetry(
    params: any, 
    retries = 3, 
    backoff = 2000
): Promise<GenerateContentResponse> {
    const ai = getClient();
    try {
        return await ai.models.generateContent(params);
    } catch (error: any) {
        if (retries > 0 && (
            error.status === 429 || 
            error.code === 429 || 
            error.message?.includes('429') || 
            error.message?.includes('Quota') ||
            error.message?.includes('quota') ||
            error.status === 503
        )) {
            console.warn(`Gemini API Rate Limit hit. Retrying in ${backoff}ms...`);
            await delay(backoff);
            return generateContentWithRetry(params, retries - 1, backoff * 2);
        }
        throw error;
    }
}

// Unified Generator
async function generateGeneric(
    prompt: string,
    systemInstruction: string,
    tools: Tool[] = [],
    config: any = {}
): Promise<GenericResponse> {
    
    // Feature: Support per-agent model override via config.modelIdOverride
    const activeModelId = config.modelIdOverride || currentConfig.modelId;

    if (currentConfig.provider === 'OPENROUTER' || config.forceOpenRouter) {
        // OpenRouter Path
        return await callOpenRouter(
            activeModelId,
            prompt,
            systemInstruction,
            tools,
            config.responseSchema
        );
    } else {
        // Google Path
        const params: any = {
            model: activeModelId,
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                tools: tools,
                temperature: config.temperature || 0.7,
                responseMimeType: config.responseMimeType,
                responseSchema: config.responseSchema,
                thinkingConfig: config.thinkingConfig
            }
        };

        const response = await generateContentWithRetry(params);
        const candidate = response.candidates?.[0];
        const functionCalls = candidate?.content?.parts?.filter(p => p.functionCall).map(p => p.functionCall);
        let toolCall = undefined;
        if (functionCalls && functionCalls.length > 0) {
            const call = functionCalls[0];
            toolCall = {
                name: call.name,
                args: call.args,
                id: call.id || 'unknown-id'
            };
        }

        const chunks = candidate?.groundingMetadata?.groundingChunks;
        let citations: { title: string; uri: string }[] = [];
        if (chunks) {
            citations = chunks
                .filter(c => c.web?.uri && c.web?.title)
                .map(c => ({ title: c.web!.title!, uri: c.web!.uri! }));
        }

        return {
            text: response.text || "",
            citations,
            toolCall,
            usage: response.usageMetadata,
            searchQueries: (chunks && chunks.length > 0) ? 1 : 0
        };
    }
}

// --- Exported Services ---

export const suggestCouncil = async (topic: string): Promise<Agent[]> => {
    return generateCouncilFromTheme(topic, 3);
};

export const generateCouncilFromTheme = async (theme: string, count: number = 4): Promise<Agent[]> => {
    const prompt = `
    Theme: "${theme}"
    Create ${count} unique, distinct AI debate personas (Agents) that fit this theme.
    Return a JSON array of objects with keys: name, role (one of OPTIMIST, SKEPTIC, REALIST, VISIONARY, HISTORIAN, SCIENTIST, ETHICIST, ECONOMIST), description, systemPrompt.
    
    IMPORTANT: 
    1. The 'systemPrompt' MUST instruct the agent to embody the specific character/role defined.
    2. The 'systemPrompt' MUST instruct the agent to speak in the same language as the theme "${theme}".
    `;

    try {
        const response = await generateGeneric(
            prompt,
            "You are a creative character generator.",
            [],
            {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            role: { type: Type.STRING },
                            description: { type: Type.STRING },
                            systemPrompt: { type: Type.STRING }
                        },
                        required: ['name', 'role', 'description', 'systemPrompt']
                    }
                }
            }
        );

        let rawAgents = [];
        try {
            const cleanText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
            rawAgents = JSON.parse(cleanText || '[]');
        } catch (e) {
            console.error("Failed to parse agents JSON", e);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return rawAgents.map((a: any, index: number) => ({
            id: `custom-agent-${Date.now()}-${index}`,
            name: a.name,
            role: a.role as AgentRole,
            description: a.description,
            systemPrompt: a.systemPrompt,
            avatarColor: ['bg-emerald-500', 'bg-rose-500', 'bg-violet-500', 'bg-blue-500', 'bg-orange-500', 'bg-pink-500', 'bg-cyan-500'][index % 7]
        }));
    } catch (e) {
        console.error(e);
        return [];
    }
};

const getPhaseInstructions = (phase: DebatePhase, currentTopic: string): string => {
  const isGoogle = currentConfig.provider === 'GOOGLE';
  const hasPerplexity = !!currentConfig.perplexityApiKey;
  
  let searchInstruct = "";
  if (isGoogle) {
      searchInstruct = "- OPTIONAL: Use Google Search ONLY if you need to verify a specific statistic.";
  } else if (hasPerplexity) {
      searchInstruct = "- OPTIONAL: Use 'search_web' tool to find real-time facts if necessary.";
  } else {
      searchInstruct = "- Use your knowledge base to verify facts.";
  }

  switch (phase) {
    case DebatePhase.OPENING:
      return `Phase: OPENING ARGUMENTS. 
      - State your persona's initial stance on "${currentTopic}".
      ${searchInstruct}
      - Keep it under 100 words.`;
    case DebatePhase.REBUTTAL:
      return `Phase: CROSS-EXAMINATION.
      - Identify a weakness in a previous argument.
      ${searchInstruct}
      - Be sharp and critical.
      - Keep it under 150 words.`;
    case DebatePhase.SYNTHESIS:
      return `Phase: SYNTHESIS.
      - Reflect on critiques.
      - Refine your stance towards a practical solution.
      - Keep it under 100 words.`;
    default:
      return `Discuss the topic "${currentTopic}".`;
  }
};

export const generateAgentTurn = async (
  agent: Agent,
  transcript: Message[],
  currentTopic: string,
  phase: DebatePhase,
  contextDocuments: ContextDocument[] = []
): Promise<{ 
  text: string; 
  citations?: { title: string; uri: string }[];
  toolCall?: { name: string; args: any; id: string };
  usage: any;
  searchQueries: number;
}> => {
  // Cost Optimization: Context Window Truncation
  const recentTranscript = transcript.length > 15 
    ? transcript.slice(-15) 
    : transcript;

  const historyText = recentTranscript.map(m => {
    if (m.agentId === 'agent-chairperson') {
        return `[MODERATOR GUIDANCE]: ${m.content}`;
    }
    if (m.isGuest) {
        return `[GUEST EXPERT ${m.guestRole}]: ${m.content}`;
    }
    if (m.agentId === 'system') {
        return `[SYSTEM INJECTION]: ${m.content}`;
    }
    return `${m.agentId === 'user' ? 'User' : m.agentId}: ${m.content}`; 
  }).join('\n\n');

  const phaseInstructions = getPhaseInstructions(phase, currentTopic);

  // Feature: Research Injection
  const contextText = contextDocuments.length > 0 
    ? `\nREFERENCE MATERIAL / CONTEXT (PRIORITIZE THESE FACTS):\n${contextDocuments.map(d => `[DOC]: ${d.content}`).join('\n\n')}\n`
    : '';

  const prompt = `
    Current Debate Topic: "${currentTopic}"
    ${contextText}
    TRANSCRIPT HISTORY (Recent):
    ${historyText}
    ---
    YOUR INSTRUCTIONS:
    ${phaseInstructions}
    
    CRITICAL RULES:
    1. LANGUAGE: You MUST generate your response (and any tool arguments) in the same language as the debate topic ("${currentTopic}"). Do NOT translate the topic, but speak in that language.
    2. If the Moderator has given guidance in the transcript, you MUST follow it.
    3. INTERACTIVE: If you need to know the User's opinion on a subjective matter, preference, or moral dilemma, USE the 'askUser' tool. Do not guess. Asking the user is encouraged.
  `;

  const tools: Tool[] = [
    { functionDeclarations: [askUserFunction] }
  ];
  
  if (currentConfig.provider === 'GOOGLE') {
      tools.unshift({ googleSearch: {} });
  } else if (currentConfig.perplexityApiKey) {
      // Feature: Add Perplexity Search tool for non-Google models
      // @ts-ignore - Manual tool injection for OpenRouter
      tools[0].functionDeclarations.push(searchWebFunction);
  }

  try {
    const response = await generateGeneric(
        prompt,
        agent.systemPrompt,
        tools,
        { 
            temperature: 0.7,
            modelIdOverride: agent.modelOverride 
        }
    );

    if (response.toolCall) {
         return response;
    }

    return {
      text: response.text || "I have no further comments.",
      citations: response.citations,
      usage: response.usage,
      searchQueries: response.searchQueries
    };

  } catch (error) {
    console.error("Agent Turn Error:", error);
    return { text: "Error generating response.", usage: {}, searchQueries: 0 };
  }
};

export const detectFallacies = async (
    text: string, 
    topic: string
): Promise<{ fallacy: Fallacy | null; usage: any }> => {
    if (!text || text.length < 150) return { fallacy: null, usage: null };

    const prompt = `
    Analyze the following debate argument for logical fallacies.
    Topic: "${topic}"
    Argument: "${text}"
    
    Common fallacies to watch for: Ad Hominem, Strawman, Red Herring, Slippery Slope, Appeal to Authority, False Dichotomy, Circular Reasoning.
    
    If a clear logical fallacy is present, return JSON:
    { "found": true, "name": "Fallacy Name", "reason": "Short explanation (max 15 words)", "severity": "minor" | "major" }
    
    If no fallacy is found or it's just a strong opinion, return:
    { "found": false }
    `;

    try {
        const response = await generateGeneric(
            prompt,
            "You are a logic analyzer. Output JSON only.",
            [],
            {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        found: { type: Type.BOOLEAN },
                        name: { type: Type.STRING },
                        reason: { type: Type.STRING },
                        severity: { type: Type.STRING, enum: ['minor', 'major'] }
                    }
                }
            }
        );

        let json = { found: false };
        try {
             const cleanText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
             json = JSON.parse(cleanText || '{}');
        } catch (e) {}

        if (json.found) {
            return {
                fallacy: {
                    // @ts-ignore
                    name: json.name || "Logical Fallacy",
                    // @ts-ignore
                    reason: json.reason || "Flawed logic detected.",
                    // @ts-ignore
                    severity: json.severity || 'minor'
                },
                usage: response.usage
            };
        }
    } catch (e) {
        console.warn("Fallacy check failed or skipped.");
    }
    
    return { fallacy: null, usage: null };
}

export const generateToolResponse = async (
  agentName: string,
  systemPrompt: string,
  transcript: Message[],
  currentTopic: string,
  toolCallId: string,
  toolCallName: string,
  toolResponseResult: any
): Promise<{ text: string; citations?: { title: string; uri: string }[]; usage: any; searchQueries: number }> => {
    const prompt = `
    Current Topic: "${currentTopic}"
    System: You previously called tool '${toolCallName}'. Result: ${JSON.stringify(toolResponseResult)}.
    Continue your turn immediately based on this info.
    
    IMPORTANT: Your response MUST be in the same language as the topic ("${currentTopic}").
    `;

    const tools = currentConfig.provider === 'GOOGLE' ? [{ googleSearch: {} }] : [];

    const response = await generateGeneric(prompt, systemPrompt, tools);

    return {
        text: response.text || "Acknowledged.",
        citations: response.citations,
        usage: response.usage,
        searchQueries: response.searchQueries
    };
}

export const castVote = async (
    agent: Agent,
    topic: string,
    transcript: Message[],
    otherAgents: Agent[]
): Promise<{ vote: Vote, usage: any }> => {
    const candidates = otherAgents.filter(a => a.id !== agent.id);
    const candidateNames = candidates.map(c => c.name).join(', ');
    const recentTranscript = transcript.slice(-10).map(m => `${m.agentId}: ${m.content}`).join('\n');

    const prompt = `
    Cast a vote for the best argument on "${topic}".
    Candidates: ${candidateNames}
    Recent Context: ${recentTranscript}
    
    IMPORTANT: The 'reason' MUST be in the same language as the topic ("${topic}").
    Return JSON.
    `;

    const response = await generateGeneric(
        prompt,
        agent.systemPrompt,
        [],
        {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    targetAgentId: { type: Type.STRING },
                    score: { type: Type.NUMBER },
                    reason: { type: Type.STRING }
                },
                required: ['targetAgentId', 'score', 'reason']
            }
        }
    );
    
    let vote: Vote = { voterId: agent.id, targetAgentId: candidates[0].id, score: 5, reason: "Default" };
    try {
        const cleanText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
        const json = JSON.parse(cleanText || '{}');
        vote = {
            voterId: agent.id,
            targetAgentId: json.targetAgentId || candidates[0].id,
            score: json.score || 5,
            reason: json.reason || "Good points."
        };
    } catch (e) {}
    
    return { vote, usage: response.usage };
}

export const generateFinalVerdict = async (
    topic: string,
    transcript: Message[],
    votes: Vote[],
    agents: Agent[]
): Promise<{ verdict: FinalVerdict, usage: any }> => {
    const votesSummary = votes.map(v => {
        const voter = agents.find(a => a.id === v.voterId)?.name;
        const target = agents.find(a => a.id === v.targetAgentId)?.name;
        return `${voter} voted for ${target} (Score: ${v.score}): "${v.reason}"`;
    }).join('\n');

    const prompt = `
    Topic: ${topic}
    Votes:
    ${votesSummary}
    
    Transcript:
    ${transcript.map(m => `${m.agentId}: ${m.content}`).join('\n')}

    As the Chairperson, synthesize the "Golden Mean" or a practical conclusion from this debate.
    Do NOT just summarize who won. Propose a concrete solution or agreement that synthesizes the best parts of the arguments.
    
    IMPORTANT: The 'summary' and 'keyTakeaways' MUST be in the same language as the topic ("${topic}").

    Generate final verdict JSON.
    `;

    const config: any = {
        responseMimeType: 'application/json',
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                winnerId: { type: Type.STRING },
                summary: { type: Type.STRING, description: "The 'Golden Mean' or synthesized practical conclusion." },
                keyTakeaways: { type: Type.ARRAY, items: { type: Type.STRING } }
            }
        }
    };

    if (currentConfig.provider === 'GOOGLE') {
        config.thinkingConfig = { thinkingBudget: 2048 };
    }

    const response = await generateGeneric(
        prompt, 
        "You are the Chairperson. Synthesize a practical consensus.",
        [],
        config
    );

    let json: any = {};
    try {
        const cleanText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
        json = JSON.parse(cleanText || '{}');
    } catch(e) {}

    return {
        verdict: {
            winnerId: json.winnerId || agents[0].id,
            summary: json.summary || "Debate concluded.",
            keyTakeaways: json.keyTakeaways || [],
            votes: votes
        },
        usage: response.usage
    };
}

export const orchestratorDecide = async (
    topic: string,
    transcript: Message[],
    currentRound: number
): Promise<OrchestratorDecision> => {
    const transcriptText = transcript.map(m => `${m.agentId}: ${m.content}`).join('\n');
    
    const prompt = `
    Analyze the debate transcript on "${topic}".
    Current Round: ${currentRound}
    
    Transcript:
    ${transcriptText}

    Determine next steps.
    1. Should the debate conclude? (If Round > 3, prefer true. If Round > 5, MUST be true).
    2. Provide guidance for the next round.
    3. Should we consult the user?
    4. CRITICAL: Is the current council lacking specific expertise (e.g., Legal, Medical, Scientific) that is hindering the debate? 
       If yes, you may SUMMON a temporary "Guest Expert". 
       
       CONSTRAINT: Do NOT summon a guest if Round > 2. It is too late in the debate.
       
       Define their Name, Role (e.g. 'Constitutional Lawyer'), and System Prompt. 
       This agent will speak ONCE immediately to clarify facts.

    IMPORTANT: The 'guidance', 'reason' and guest details MUST be in the same language as the topic ("${topic}").

    Return JSON matching the schema.
    `;

    const config: any = {
        responseMimeType: 'application/json',
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                shouldConclude: { type: Type.BOOLEAN },
                guidance: { type: Type.STRING },
                shouldConsultUser: { type: Type.BOOLEAN },
                summonGuest: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        role: { type: Type.STRING },
                        systemPrompt: { type: Type.STRING },
                        reason: { type: Type.STRING, description: "Why is this guest needed?" }
                    },
                }
            }
        }
    };

    if (currentConfig.provider === 'GOOGLE') {
        config.thinkingConfig = { thinkingBudget: 1024 };
    }

    const response = await generateGeneric(prompt, "Orchestrator", [], config);

    let json: any = {};
    try {
        const cleanText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
        json = JSON.parse(cleanText || '{}');
    } catch(e) {}

    return {
        shouldConclude: json.shouldConclude || currentRound > 5,
        guidance: json.guidance || "Continue the debate.",
        shouldConsultUser: json.shouldConsultUser || false,
        summonGuest: json.summonGuest,
        usage: response.usage
    };
}

export const generateFollowUp = async (
    question: string,
    transcript: Message[],
    verdict: FinalVerdict
): Promise<{ text: string; usage: any }> => {
    const prompt = `
    The user has a follow-up question after the debate verdict.
    User Question: "${question}"
    Verdict Summary: "${verdict.summary}"
    
    Answer the user as the Chairperson.
    IMPORTANT: Answer in the same language as the User Question.
    `;
    
    const response = await generateGeneric(
        prompt,
        "You are the Chairperson. Answer helpfuly based on the debate context.",
        []
    );
    
    return { text: response.text || "I cannot answer that.", usage: response.usage };
}

export interface OrchestratorDecision {
    shouldConclude: boolean;
    guidance: string;
    shouldConsultUser: boolean;
    summonGuest?: {
        name: string;
        role: string;
        systemPrompt: string;
        reason: string;
    };
    usage: any;
}

export { calculateCost, PRICE_INPUT_1M, PRICE_OUTPUT_1M, PRICE_SEARCH_REQUEST };
