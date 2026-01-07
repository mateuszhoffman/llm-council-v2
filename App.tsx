import React, { useState, useEffect, useRef } from 'react';
import ConfigView from './components/ConfigView';
import DebateView from './components/DebateView';
import UserModal from './components/UserModal';
import { Agent, DebateState, DebatePhase, Message, DebateMode, Fallacy, Vote, AgentRole } from './types';
import { generateAgentTurn, generateToolResponse, castVote, generateFinalVerdict, calculateCost, orchestratorDecide, generateFollowUp, detectFallacies, setLLMConfig, performPerplexitySearch } from './services/geminiService';
import { v4 as uuidv4 } from 'uuid';

const INITIAL_STATE: DebateState = {
  topic: '',
  mode: 'AUTO',
  maxRounds: 2,
  currentRound: 1,
  phase: DebatePhase.SETUP,
  currentTurnAgentId: null,
  transcript: [],
  isThinking: false,
  thinkingAgentId: null,
  pendingUserQuestion: null,
  tokenUsage: { inputTokens: 0, outputTokens: 0, totalCost: 0 },
  userRequestedStop: false,
  showConsultationPrompt: false,
  summonedGuest: null,
  contextDocuments: []
};

const App: React.FC = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [state, setState] = useState<DebateState>(INITIAL_STATE);
  const processingRef = useRef(false);
  const pendingToolCallRef = useRef<{id: string, name: string} | null>(null);
  const [hasSavedSession, setHasSavedSession] = useState(false);

  // Load Settings & Check Saved Session
  useEffect(() => {
    const savedConfig = localStorage.getItem('llm_council_config');
    if (savedConfig) {
        try {
            setLLMConfig(JSON.parse(savedConfig));
        } catch (e) {
            console.error("Failed to load saved config", e);
        }
    }
    
    const savedSession = localStorage.getItem('llm_council_session');
    if (savedSession) {
        setHasSavedSession(true);
    }
  }, []);

  // Persistence: Save session on state change
  useEffect(() => {
    if (state.phase !== DebatePhase.SETUP) {
        localStorage.setItem('llm_council_session', JSON.stringify({ state, agents }));
    }
  }, [state, agents]);

  const handleResume = () => {
      const saved = localStorage.getItem('llm_council_session');
      if (saved) {
          const { state: savedState, agents: savedAgents } = JSON.parse(saved);
          setAgents(savedAgents);
          setState(savedState);
      }
  };

  const updateUsage = (usage: any, searchQueries: number = 0, perplexityCalls: number = 0) => {
      if (!usage) return;
      setState(prev => {
          const addedCost = calculateCost(usage, searchQueries, perplexityCalls);
          return {
              ...prev,
              tokenUsage: {
                  inputTokens: prev.tokenUsage.inputTokens + (usage.promptTokenCount || 0),
                  outputTokens: prev.tokenUsage.outputTokens + (usage.candidatesTokenCount || 0),
                  totalCost: prev.tokenUsage.totalCost + addedCost
              }
          }
      });
  };

  const addMessage = (agentId: string, content: string, citations?: any[], phase?: DebatePhase, isGuest: boolean = false, guestRole?: string, existingId?: string) => {
    const msg: Message = {
      id: existingId || uuidv4(),
      agentId,
      content,
      timestamp: Date.now(),
      type: 'text',
      citations,
      phase: phase || state.phase,
      isGuest,
      guestRole
    };
    setState(prev => ({
      ...prev,
      transcript: [...prev.transcript, msg]
    }));
  };

  const updateMessageFallacy = (msgId: string, fallacy: Fallacy) => {
    setState(prev => ({
      ...prev,
      transcript: prev.transcript.map(m => m.id === msgId ? { ...m, fallacy } : m)
    }));
  };

  const handleStart = (topic: string, selectedAgents: Agent[], mode: DebateMode, maxRounds: number, initialContext: string) => {
    setAgents(selectedAgents);
    
    const contextDocs = initialContext.trim() ? [{
        id: uuidv4(),
        content: initialContext,
        timestamp: Date.now()
    }] : [];

    setState({
      ...INITIAL_STATE,
      topic,
      mode,
      maxRounds,
      phase: DebatePhase.OPENING,
      currentTurnAgentId: selectedAgents[0].id,
      contextDocuments: contextDocs
    });
  };

  const handleUserAnswer = async (answer: string) => {
    if (!state.pendingUserQuestion || !state.thinkingAgentId) return;
    addMessage('user', answer, undefined, DebatePhase.USER_INPUT);
    
    // Check if this answer was for the Chairperson Consultation
    if (state.thinkingAgentId === 'agent-chairperson') {
        setState(prev => ({
            ...prev,
            pendingUserQuestion: null,
            isThinking: false, // Ready for useEffect loop to pick up new round
            phase: DebatePhase.REBUTTAL,
            currentTurnAgentId: agents[0].id,
            currentRound: prev.currentRound + 1
        }));
    } else {
        // Normal tool response (AskUser from an agent)
        setState(prev => ({
           ...prev,
           pendingUserQuestion: null,
           phase: prev.transcript[prev.transcript.length - 1]?.phase || DebatePhase.OPENING,
           isThinking: true // Resume the agent who asked
        }));
    }
  };

  const handleConsultationChoice = (accepted: boolean) => {
      if (!accepted) {
          // User declined or timed out: Proceed to next round immediately
          setState(prev => ({
              ...prev,
              showConsultationPrompt: false,
              phase: DebatePhase.REBUTTAL,
              currentTurnAgentId: agents[0].id,
              currentRound: prev.currentRound + 1,
              isThinking: false
          }));
      } else {
          // User accepted: Open text input
          setState(prev => ({
              ...prev,
              showConsultationPrompt: false,
              pendingUserQuestion: "The floor is yours. What feedback do you have for the Council?",
              thinkingAgentId: 'agent-chairperson',
              // We pause here, waiting for handleUserAnswer
          }));
      }
  };

  const handleStop = () => {
      setState(prev => ({ ...prev, userRequestedStop: true }));
      // Use system message to inform user
      addMessage('system', 'Debate stop requested. Concluding current phase...');
  };

  const handleFollowUp = async (question: string) => {
      if (!state.finalVerdict) return;
      addMessage('user', question);
      setState(prev => ({ ...prev, isThinking: true }));
      
      try {
          const result = await generateFollowUp(question, state.transcript, state.finalVerdict);
          updateUsage(result.usage, 0);
          addMessage('agent-chairperson', result.text);
      } catch (e) {
          console.error(e);
      } finally {
          setState(prev => ({ ...prev, isThinking: false }));
      }
  };

  // --- Director Mode Actions ---
  const handleDirectorInject = (msg: string) => {
      addMessage('system', `[DIRECTOR OVERRIDE]: ${msg}`);
  };

  const handleDirectorForcePhase = (phase: DebatePhase) => {
      setState(prev => ({
          ...prev,
          phase: phase,
          // Reset turn sequence to start fresh in new phase
          currentTurnAgentId: phase === DebatePhase.VOTING ? null : agents[0].id,
          isThinking: false,
          userRequestedStop: false
      }));
  };

  const handleDirectorSkipTurn = () => {
      // Force advance turn logic immediately
      advanceTurn();
  };

  const handleDirectorAddContext = (content: string) => {
      setState(prev => ({
          ...prev,
          contextDocuments: [...prev.contextDocuments, {
              id: uuidv4(),
              content,
              timestamp: Date.now()
          }]
      }));
      addMessage('system', 'New Research Context added to Council knowledge base.');
  };

  const advanceTurn = async () => {
    setState(prev => {
        // Emergency Stop Check
        if (prev.userRequestedStop) {
             return { ...prev, currentTurnAgentId: null, phase: DebatePhase.VOTING, isThinking: false };
        }

        const currentAgentIndex = agents.findIndex(a => a.id === prev.currentTurnAgentId);
        let nextIndex = currentAgentIndex + 1;
        let nextPhase = prev.phase;
        let nextRound = prev.currentRound;

        // End of Cycle for current phase
        if (nextIndex >= agents.length) {
            nextIndex = 0; // Reset to first agent
            
            // Phase Transition Logic
            if (prev.phase === DebatePhase.OPENING) {
                nextPhase = DebatePhase.REBUTTAL;
            } else if (prev.phase === DebatePhase.REBUTTAL) {
                nextPhase = DebatePhase.SYNTHESIS;
            } else if (prev.phase === DebatePhase.SYNTHESIS) {
                // Decision Point
                if (prev.mode === 'FIXED') {
                    if (prev.currentRound >= prev.maxRounds) {
                        nextPhase = DebatePhase.VOTING;
                    } else {
                        nextRound += 1;
                        nextPhase = DebatePhase.REBUTTAL; // Loop back
                    }
                } else {
                    // AUTO MODE: Trigger Orchestrator check
                    return { ...prev, currentTurnAgentId: 'ORCHESTRATOR', phase: nextPhase, isThinking: false };
                }
            }
        }
        
        // If transitioning to voting immediately
        if (nextPhase === DebatePhase.VOTING) {
             return { ...prev, currentTurnAgentId: null, phase: nextPhase, isThinking: false };
        }

        return {
            ...prev,
            currentTurnAgentId: agents[nextIndex].id,
            phase: nextPhase,
            currentRound: nextRound,
            isThinking: false,
            thinkingAgentId: null
        };
    });
  };

  // Main Orchestration Loop
  useEffect(() => {
    const runDebateStep = async () => {
      if (processingRef.current) return;
      if (state.pendingUserQuestion) return;
      if (state.showConsultationPrompt) return; // Pause for user input timer

      // 1. Voting Phase
      if (state.phase === DebatePhase.VOTING && !state.isThinking && !state.finalVerdict) {
          processingRef.current = true;
          setState(prev => ({ ...prev, isThinking: true }));
          try {
              // Execute votes sequentially to respect API Rate Limits
              const votes: Vote[] = [];
              for (const agent of agents) {
                  // Small delay between votes to prevent burst 429 errors
                  await new Promise(r => setTimeout(r, 1000));
                  try {
                    const r = await castVote(agent, state.topic, state.transcript, agents);
                    updateUsage(r.usage);
                    votes.push(r.vote);
                  } catch (e) {
                      console.error(`Error voting for agent ${agent.name}`, e);
                  }
              }
              
              const verdictRes = await generateFinalVerdict(state.topic, state.transcript, votes, agents);
              updateUsage(verdictRes.usage);
              
              setState(prev => ({
                  ...prev,
                  phase: DebatePhase.VERDICT,
                  isThinking: false,
                  finalVerdict: verdictRes.verdict
              }));
          } catch (e) { 
              console.error(e);
              // Retry or exit? For now, we leave it in thinking state or error out. 
              // With the new retry logic in service, this catch should only happen after multiple failed retries.
          } 
          finally { processingRef.current = false; }
          return;
      }

      // 2. Orchestrator Decision (Auto Mode)
      if (state.currentTurnAgentId === 'ORCHESTRATOR') {
          processingRef.current = true;
          setState(prev => ({ ...prev, isThinking: true }));
          try {
              const decision = await orchestratorDecide(state.topic, state.transcript, state.currentRound);
              updateUsage(decision.usage);
              
              if (decision.shouldConclude || state.userRequestedStop) {
                  addMessage('system', `Chairperson Concluding: ${decision.guidance}`);
                  setState(prev => ({ ...prev, currentTurnAgentId: null, phase: DebatePhase.VOTING, isThinking: false }));
              } else {
                  // If Guest is Summoned
                  if (decision.summonGuest) {
                       const guest = decision.summonGuest;
                       // Show "Summoning" state via message
                       addMessage('agent-chairperson', `(Summoning Expert) I am calling upon ${guest.name}, a ${guest.role}, to clarify this point because: ${guest.reason}`);
                       
                       setState(prev => ({
                           ...prev,
                           summonedGuest: { name: guest.name, role: guest.role, reason: guest.reason }
                           // Keep thinking true to flow into guest generation
                       }));
                       
                       // Generate Guest Turn Immediately
                       const guestResult = await generateAgentTurn(
                           { 
                             id: 'guest',
                             name: guest.name,
                             role: AgentRole.GUEST,
                             systemPrompt: guest.systemPrompt,
                             avatarColor: 'bg-amber-500', 
                             description: `Guest Expert: ${guest.role}`
                           }, 
                           state.transcript,
                           state.topic,
                           state.phase,
                           state.contextDocuments
                       );
                       updateUsage(guestResult.usage, guestResult.searchQueries);
                       
                       const msgId = uuidv4();
                       addMessage(guest.name, guestResult.text, guestResult.citations, state.phase, true, guest.role, msgId);

                       // Trigger Async Fallacy Check for Guest
                       detectFallacies(guestResult.text, state.topic).then(res => {
                           updateUsage(res.usage);
                           if(res.fallacy) updateMessageFallacy(msgId, res.fallacy);
                       });
                       
                       // After guest speaks, resume normal flow
                       setState(prev => ({
                           ...prev,
                           summonedGuest: null,
                           currentTurnAgentId: agents[0].id,
                           phase: DebatePhase.REBUTTAL,
                           currentRound: prev.currentRound + 1,
                           isThinking: false
                       }));
                       return;
                  }

                  // Inject GUIDANCE into transcript so agents see it next turn
                  addMessage('agent-chairperson', decision.guidance);
                  
                  if (decision.shouldConsultUser) {
                      setState(prev => ({
                          ...prev,
                          isThinking: false,
                          showConsultationPrompt: true
                      }));
                  } else {
                      // Proceed normally
                      setState(prev => ({ 
                          ...prev, 
                          currentTurnAgentId: agents[0].id, // Start next round with first agent
                          phase: DebatePhase.REBUTTAL,
                          currentRound: prev.currentRound + 1,
                          isThinking: false
                      }));
                  }
              }
          } catch (e) {
              // Fallback continue
              console.error(e);
              setState(prev => ({ ...prev, currentTurnAgentId: agents[0].id, phase: DebatePhase.REBUTTAL, isThinking: false }));
          } finally {
              processingRef.current = false;
          }
          return;
      }

      // 3. Normal Agent Turns
      if (!state.currentTurnAgentId || state.phase === DebatePhase.VERDICT) return;
      if (state.isThinking && !pendingToolCallRef.current) return; 

      // Resume from Tool
      if (pendingToolCallRef.current && state.isThinking) {
        processingRef.current = true;
        const agent = agents.find(a => a.id === state.currentTurnAgentId);
        if (!agent) return;
        try {
            const lastMsg = state.transcript[state.transcript.length - 1];
            const answer = lastMsg.agentId === 'user' ? lastMsg.content : "Proceed.";
            const result = await generateToolResponse(
                agent.name,
                agent.systemPrompt,
                state.transcript,
                state.topic,
                pendingToolCallRef.current.id,
                pendingToolCallRef.current.name,
                { answer }
            );
            updateUsage(result.usage, result.searchQueries);
            pendingToolCallRef.current = null;
            
            const msgId = uuidv4();
            addMessage(agent.id, result.text, result.citations, undefined, false, undefined, msgId);
            // Async Fallacy Check
            detectFallacies(result.text, state.topic).then(res => {
                updateUsage(res.usage);
                if(res.fallacy) updateMessageFallacy(msgId, res.fallacy);
            });

            advanceTurn();
        } finally { processingRef.current = false; }
        return;
      }

      // Start Turn
      if (!state.isThinking) {
         processingRef.current = true;
         setState(prev => ({ ...prev, isThinking: true, thinkingAgentId: state.currentTurnAgentId }));
         const agent = agents.find(a => a.id === state.currentTurnAgentId);
         if (!agent) { processingRef.current = false; return; }

         try {
             const result = await generateAgentTurn(
                 agent,
                 state.transcript,
                 state.topic,
                 state.phase,
                 state.contextDocuments
             );
             
             // Handle Tool Calls
             if (result.toolCall) {
                 if (result.toolCall.name === 'askUser') {
                     // Pause for user interaction
                     updateUsage(result.usage, result.searchQueries);
                     pendingToolCallRef.current = { id: result.toolCall.id, name: result.toolCall.name };
                     setState(prev => ({
                         ...prev,
                         isThinking: false,
                         phase: DebatePhase.USER_INPUT,
                         pendingUserQuestion: result.toolCall!.args.question
                     }));
                 } else if (result.toolCall.name === 'search_web') {
                     // Automate Perplexity Search Tool
                     const query = result.toolCall.args.query;
                     const searchRes = await performPerplexitySearch(query);
                     // Note: We don't display the tool call in UI, but we record the search usage cost
                     updateUsage(result.usage, result.searchQueries, 1); 
                     
                     // Store as pending tool to resume immediately via generateToolResponse in next cycle (step 3 above)
                     pendingToolCallRef.current = { id: result.toolCall.id, name: result.toolCall.name };
                     
                     // Temporarily inject the "result" into the last message or state? 
                     // Actually, we must feed it back via `generateToolResponse`.
                     // The loop checks `pendingToolCallRef.current` first thing. 
                     // So we just need to ensure the *next* pass calls `generateToolResponse` with the `searchRes.text`.
                     
                     // Issue: `generateToolResponse` needs the *answer* passed in. 
                     // The logic in step 3 (Resume from Tool) gets answer from `lastMsg.content`. 
                     // We need to inject a "hidden" message or modify the logic to handle system results.
                     
                     // Solution: Modify state to store the "Tool Result" temporarily if it's automated?
                     // Easier: Just do it inline here and recurse or set state such that the next tick handles it.
                     
                     // Actually, let's execute the response generation *now* to avoid UI flickering/pausing.
                     const toolResult = await generateToolResponse(
                        agent.name,
                        agent.systemPrompt,
                        state.transcript,
                        state.topic,
                        result.toolCall.id,
                        result.toolCall.name,
                        { result: searchRes.text }
                     );
                     
                     // Add the final text
                     updateUsage(toolResult.usage, toolResult.searchQueries);
                     const msgId = uuidv4();
                     addMessage(agent.id, toolResult.text, toolResult.citations, undefined, false, undefined, msgId);
                     
                     detectFallacies(toolResult.text, state.topic).then(res => {
                        updateUsage(res.usage);
                        if(res.fallacy) updateMessageFallacy(msgId, res.fallacy);
                     });
                     
                     advanceTurn();
                 }
             } else {
                 // Standard Text Response
                 updateUsage(result.usage, result.searchQueries);
                 const msgId = uuidv4();
                 addMessage(agent.id, result.text, result.citations, undefined, false, undefined, msgId);
                 detectFallacies(result.text, state.topic).then(res => {
                     updateUsage(res.usage);
                     if(res.fallacy) updateMessageFallacy(msgId, res.fallacy);
                 });
                 
                 advanceTurn();
             }
         } catch (e) {
             console.error(e);
             advanceTurn();
         } finally {
             processingRef.current = false;
         }
      }
    };

    runDebateStep();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.currentTurnAgentId, state.isThinking, state.transcript.length, state.showConsultationPrompt]); 

  return (
    <>
      {state.phase === DebatePhase.SETUP && (
        <ConfigView 
            onStart={handleStart} 
            onResume={handleResume}
            hasSavedSession={hasSavedSession}
        />
      )}
      
      {state.phase !== DebatePhase.SETUP && (
        <DebateView 
            agents={agents} 
            state={state} 
            onStop={handleStop} 
            onFollowUp={handleFollowUp}
            onConsultationChoice={handleConsultationChoice}
            directorActions={{
                injectMessage: handleDirectorInject,
                forcePhase: handleDirectorForcePhase,
                skipTurn: handleDirectorSkipTurn,
                addContext: handleDirectorAddContext
            }}
        />
      )}

      {state.pendingUserQuestion && state.thinkingAgentId && (
        <UserModal 
            question={state.pendingUserQuestion} 
            agentId={state.thinkingAgentId} 
            agents={agents}
            onSubmit={handleUserAnswer}
        />
      )}
    </>
  );
};

export default App;
