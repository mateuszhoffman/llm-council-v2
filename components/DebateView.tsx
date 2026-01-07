import React, { useEffect, useRef, useState } from 'react';
import { Agent, DebateState, Message, DebatePhase, ContextDocument } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, Loader2, Scale, Trophy, Quote, OctagonX, DollarSign, Send, ChevronDown, ChevronUp, MicVocal, Sparkles, MessageSquarePlus, Timer, Zap, ShieldAlert, Clapperboard, Download, SkipForward, Megaphone, Plus, BookOpen } from 'lucide-react';

interface DebateViewProps {
  agents: Agent[];
  state: DebateState;
  onStop: () => void;
  onFollowUp: (q: string) => void;
  onConsultationChoice?: (accepted: boolean) => void;
  // Director Mode Handlers
  directorActions: {
      injectMessage: (msg: string) => void;
      forcePhase: (phase: DebatePhase) => void;
      skipTurn: () => void;
      addContext: (content: string) => void;
  }
}

// Simple Markdown Renderer Component
const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
    // Helper to parse line by line for list items, then parse inline styles
    const renderLine = (line: string, index: number) => {
        const isListItem = line.trim().startsWith('- ') || line.trim().startsWith('* ');
        const textContent = isListItem ? line.trim().substring(2) : line;

        // Split by bold (**...**) and italic (*...*)
        // Regex captures delimiters to keep them in the array for processing
        const parts = textContent.split(/(\*\*.*?\*\*|\*.*?\*)/g);

        const renderedParts = parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={i} className="font-bold text-white">{part.slice(2, -2)}</strong>;
            }
            if (part.startsWith('*') && part.endsWith('*')) {
                return <em key={i} className="italic text-blue-200">{part.slice(1, -1)}</em>;
            }
            return <span key={i}>{part}</span>;
        });

        if (isListItem) {
            return (
                <div key={index} className="flex items-start gap-2 mb-1 pl-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/40 mt-2 shrink-0" />
                    <div className="flex-1">{renderedParts}</div>
                </div>
            );
        }

        return <div key={index} className="min-h-[1.5em]">{renderedParts}</div>;
    };

    return (
        <div className="text-sm md:text-base leading-7 font-light space-y-1">
            {content.split('\n').map((line, i) => renderLine(line, i))}
        </div>
    );
};

const DirectorConsole: React.FC<{ 
    isOpen: boolean; 
    setIsOpen: (o: boolean) => void; 
    state: DebateState;
    actions: DebateViewProps['directorActions'];
}> = ({ isOpen, setIsOpen, state, actions }) => {
    const [msg, setMsg] = useState('');
    const [contextInput, setContextInput] = useState('');

    const handleExport = (format: 'json' | 'md') => {
        let content = '';
        let mime = 'text/plain';
        let ext = 'txt';

        if (format === 'json') {
            content = JSON.stringify(state, null, 2);
            mime = 'application/json';
            ext = 'json';
        } else {
            content = `# Debate: ${state.topic}\n\n`;
            content += `## Verdict\n${state.finalVerdict?.summary || 'Pending'}\n\n## Transcript\n\n`;
            state.transcript.forEach(m => {
                content += `**${m.agentId}**: ${m.content}\n\n`;
            });
            mime = 'text/markdown';
            ext = 'md';
        }

        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `debate-${Date.now()}.${ext}`;
        a.click();
    };

    return (
        <>
            {/* Toggle Button */}
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className={`fixed bottom-6 right-6 z-[60] p-4 rounded-full shadow-2xl transition-all border border-white/10 ${isOpen ? 'bg-red-500 rotate-90' : 'bg-[#111] hover:bg-red-900/50'}`}
            >
                {isOpen ? <OctagonX className="text-white" /> : <Clapperboard className="text-red-500" />}
            </button>

            {/* Console Panel */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div 
                        initial={{ x: 400, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 400, opacity: 0 }}
                        className="fixed top-0 right-0 h-full w-96 bg-[#0a0a0a]/95 backdrop-blur-xl border-l border-red-500/20 z-[55] shadow-2xl overflow-y-auto p-6 flex flex-col gap-8"
                    >
                        <div className="flex items-center gap-3 text-red-500 mb-2">
                            <Clapperboard size={24} />
                            <h2 className="text-xl font-bold tracking-wider uppercase">Director Mode</h2>
                        </div>

                        {/* Phase Control */}
                        <div className="space-y-3">
                            <h3 className="text-xs font-bold text-gray-500 uppercase">Phase Override</h3>
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => actions.forcePhase(DebatePhase.REBUTTAL)} className="p-2 bg-white/5 hover:bg-white/10 rounded text-xs text-gray-300">Rebuttal</button>
                                <button onClick={() => actions.forcePhase(DebatePhase.SYNTHESIS)} className="p-2 bg-white/5 hover:bg-white/10 rounded text-xs text-gray-300">Synthesis</button>
                                <button onClick={() => actions.forcePhase(DebatePhase.VOTING)} className="p-2 bg-red-500/20 hover:bg-red-500 text-red-200 hover:text-white rounded text-xs font-bold col-span-2">Force Vote / Verdict</button>
                            </div>
                        </div>

                        {/* Playback Control */}
                        <div className="space-y-3">
                            <h3 className="text-xs font-bold text-gray-500 uppercase">Playback</h3>
                            <button 
                                onClick={actions.skipTurn}
                                className="w-full flex items-center justify-center gap-2 p-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-bold text-white transition-colors"
                            >
                                <SkipForward size={16} /> Skip Current Turn
                            </button>
                        </div>

                        {/* Injection */}
                        <div className="space-y-3">
                            <h3 className="text-xs font-bold text-gray-500 uppercase">God Mode Injection</h3>
                            <textarea 
                                value={msg} onChange={e => setMsg(e.target.value)}
                                placeholder="Send a system directive (e.g. 'Assume budget is $0')..."
                                className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-sm text-white resize-none h-24 focus:border-red-500 focus:outline-none"
                            />
                            <button 
                                onClick={() => { actions.injectMessage(msg); setMsg(''); }}
                                disabled={!msg}
                                className="w-full flex items-center justify-center gap-2 p-3 bg-red-500 hover:bg-red-600 disabled:opacity-50 rounded-xl text-sm font-bold text-white transition-colors"
                            >
                                <Megaphone size={16} /> Inject Message
                            </button>
                        </div>

                        {/* Research Injection */}
                        <div className="space-y-3">
                            <h3 className="text-xs font-bold text-gray-500 uppercase">Research Context</h3>
                            <div className="max-h-32 overflow-y-auto space-y-2 mb-2">
                                {state.contextDocuments.map(d => (
                                    <div key={d.id} className="text-[10px] text-gray-400 bg-white/5 p-2 rounded truncate">
                                        {d.content}
                                    </div>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <input 
                                    value={contextInput} onChange={e => setContextInput(e.target.value)}
                                    placeholder="Add fact..."
                                    className="flex-1 bg-black/50 border border-white/10 rounded-lg px-2 text-xs text-white focus:outline-none"
                                />
                                <button 
                                    onClick={() => { actions.addContext(contextInput); setContextInput(''); }}
                                    disabled={!contextInput}
                                    className="p-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white disabled:opacity-50"
                                >
                                    <Plus size={14} />
                                </button>
                            </div>
                        </div>

                        {/* Export */}
                        <div className="mt-auto pt-6 border-t border-white/10 space-y-3">
                            <h3 className="text-xs font-bold text-gray-500 uppercase">Export Session</h3>
                            <div className="flex gap-2">
                                <button onClick={() => handleExport('json')} className="flex-1 p-3 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold text-gray-300 flex items-center justify-center gap-2">
                                    <Download size={14} /> JSON
                                </button>
                                <button onClick={() => handleExport('md')} className="flex-1 p-3 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold text-gray-300 flex items-center justify-center gap-2">
                                    <Download size={14} /> MD
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

const ConsultationPrompt: React.FC<{ onChoice: (accepted: boolean) => void }> = ({ onChoice }) => {
    const [progress, setProgress] = useState(100);
    
    useEffect(() => {
        const duration = 10000; // 10s
        const interval = 100;
        const step = 100 / (duration / interval);
        
        const timer = setInterval(() => {
            setProgress(p => {
                if (p <= 0) {
                    clearInterval(timer);
                    onChoice(false); // Auto-decline
                    return 0;
                }
                return p - step;
            });
        }, interval);

        return () => clearInterval(timer);
    }, [onChoice]);

    return (
        <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 w-full max-w-md"
        >
            <div className="bg-[#111] border border-emerald-500/30 rounded-2xl p-6 shadow-[0_0_50px_rgba(16,185,129,0.2)] overflow-hidden relative">
                {/* Progress Bar */}
                <div className="absolute top-0 left-0 h-1 bg-emerald-900 w-full">
                    <motion.div 
                        className="h-full bg-emerald-500" 
                        style={{ width: `${progress}%` }}
                    />
                </div>

                <div className="flex items-start gap-4 mb-4">
                    <div className="p-3 bg-emerald-500/10 rounded-full animate-pulse">
                        <MessageSquarePlus className="text-emerald-400" size={24} />
                    </div>
                    <div>
                        <h3 className="text-white font-bold text-lg">The Chairperson Asks</h3>
                        <p className="text-emerald-200/70 text-sm">Do you have any comments on the debate so far?</p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button 
                        onClick={() => onChoice(true)}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-colors"
                    >
                        YES, I Have Input
                    </button>
                    <button 
                        onClick={() => onChoice(false)}
                        className="flex-1 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white font-medium py-3 rounded-xl transition-colors"
                    >
                        No, Continue
                    </button>
                </div>
                
                <div className="absolute top-2 right-3 flex items-center gap-1 text-[10px] text-gray-500 font-mono">
                    <Timer size={10} />
                    {(progress / 10).toFixed(0)}s
                </div>
            </div>
        </motion.div>
    );
};

const PhaseHeader: React.FC<{ phase: DebatePhase }> = ({ phase }) => {
    let title = "";
    let sub = "";
    
    switch(phase) {
        case DebatePhase.OPENING: title = "Opening Arguments"; sub = "The Council presents their initial stances."; break;
        case DebatePhase.REBUTTAL: title = "Cross-Examination"; sub = "Critique, defend, and counter-attack."; break;
        case DebatePhase.SYNTHESIS: title = "Synthesis"; sub = "Finding common ground and refining views."; break;
        case DebatePhase.VOTING: title = "Voting Session"; sub = "Confidential ballots are being cast."; break;
        case DebatePhase.VERDICT: title = "Final Verdict"; sub = "The Chairperson has reached a conclusion."; break;
        case DebatePhase.USER_INPUT: title = "Consultation"; sub = "The Council requires your input."; break;
        default: return null;
    }

    return (
        <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-10 opacity-80"
        >
            <div className="flex items-center gap-4 w-full px-8 md:px-20">
                <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent flex-1" />
                <div className="px-4 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-widest text-purple-300 flex items-center gap-2">
                    <BookOpen size={12} />
                    {phase}
                </div>
                <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent flex-1" />
            </div>
            <h3 className="mt-4 text-2xl font-bold text-white text-center tracking-tight">{title}</h3>
            <p className="text-sm text-gray-500 text-center max-w-md mt-1">{sub}</p>
        </motion.div>
    );
};

const AgentSpotlight: React.FC<{ 
  agent: Agent; 
  isActive: boolean; 
  isThinking: boolean;
  align: 'left' | 'right';
}> = ({ agent, isActive, isThinking, align }) => {
  return (
    <motion.div 
      className={`relative flex items-center gap-4 transition-all duration-700 ${isActive ? 'scale-110 opacity-100 z-10' : 'scale-90 opacity-40 grayscale-[80%]'}`}
      animate={{ x: isActive ? (align === 'left' ? 20 : -20) : 0 }}
    >
      {/* Glow Effect */}
      {isActive && (
          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full ${agent.avatarColor.replace('bg-', 'bg-')}/30 blur-3xl -z-10`} />
      )}

      {align === 'right' && (
          <div className="text-right hidden md:block">
              <h3 className={`font-bold text-sm ${isActive ? 'text-white' : 'text-gray-500'}`}>{agent.name}</h3>
              <p className="text-[10px] uppercase tracking-widest text-gray-400">{agent.role}</p>
          </div>
      )}

      <div className="relative">
        <div className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center text-2xl font-bold text-white shadow-2xl transition-all duration-500 ${isActive ? 'ring-2 ring-white ring-offset-2 ring-offset-black scale-105' : ''} ${agent.avatarColor}`}>
          {agent.name.charAt(0)}
        </div>
        
        {isActive && isThinking && (
          <div className="absolute -top-1 -right-1 flex h-4 w-4">
             <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
             <span className="relative inline-flex rounded-full h-4 w-4 bg-white"></span>
          </div>
        )}
      </div>

      {align === 'left' && (
          <div className="text-left hidden md:block">
              <h3 className={`font-bold text-sm ${isActive ? 'text-white' : 'text-gray-500'}`}>{agent.name}</h3>
              <p className="text-[10px] uppercase tracking-widest text-gray-400">{agent.role}</p>
          </div>
      )}
    </motion.div>
  );
};

const ChatBubble: React.FC<{ message: Message; agents: Agent[] }> = ({ message, agents }) => {
  const agent = agents.find(a => a.id === message.agentId);
  const isUser = message.agentId === 'user';
  const isSystem = message.agentId === 'system';
  const isModerator = message.agentId === 'agent-chairperson';
  const isGuest = message.isGuest;

  const [isExpanded, setIsExpanded] = useState(false);
  const isLong = message.content.length > 300;
  
  if (isSystem) return (
      <div className="flex justify-center my-6">
          <span className="text-[10px] uppercase tracking-[0.2em] text-red-300 bg-red-900/20 border border-red-500/20 px-4 py-1.5 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.2)] animate-pulse">{message.content}</span>
      </div>
  );

  if (isModerator) return (
      <motion.div 
         initial={{ opacity: 0, scale: 0.95, y: 10 }}
         animate={{ opacity: 1, scale: 1, y: 0 }}
         className="flex justify-center my-8 w-full px-4"
      >
          <div className="relative bg-black/40 border border-emerald-500/30 rounded-2xl p-6 max-w-2xl w-full text-center shadow-[0_0_30px_rgba(16,185,129,0.1)] overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-50" />
              <div className="flex items-center justify-center gap-2 text-emerald-400 mb-3">
                  <MicVocal size={16} />
                  <span className="text-xs font-bold uppercase tracking-widest">Chairperson Intervention</span>
              </div>
              <p className="text-emerald-50 text-base md:text-lg font-serif italic leading-relaxed">"{message.content}"</p>
          </div>
      </motion.div>
  );

  // Guest Expert Bubble
  if (isGuest) return (
      <motion.div 
         initial={{ opacity: 0, x: -50, filter: 'blur(10px)' }}
         animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
         transition={{ type: 'spring', bounce: 0.4 }}
         className="flex justify-center my-10 w-full px-4 relative z-20"
      >
          <div className="relative bg-[#0F0F15] border border-amber-500/50 rounded-2xl p-8 max-w-3xl w-full shadow-[0_0_60px_rgba(245,158,11,0.15)] overflow-hidden group">
              {/* Animated Border */}
              <div className="absolute inset-0 border border-amber-500/20 rounded-2xl pointer-events-none" />
              <div className="absolute -top-10 -left-10 w-32 h-32 bg-amber-500/20 blur-3xl rounded-full" />
              <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-purple-500/20 blur-3xl rounded-full" />

              <div className="flex items-center gap-4 mb-4 pb-4 border-b border-white/5">
                  <div className="w-12 h-12 rounded-full bg-amber-500 flex items-center justify-center text-black font-bold text-xl shadow-lg ring-2 ring-white/20">
                    <Zap size={24} fill="currentColor" />
                  </div>
                  <div>
                      <h4 className="text-amber-400 font-bold text-lg">{message.agentId}</h4>
                      <div className="flex items-center gap-2 text-xs text-amber-200/60 uppercase tracking-widest font-medium">
                          <span className="bg-amber-500/10 px-2 py-0.5 rounded">Guest Expert</span>
                          <span>•</span>
                          <span>{message.guestRole}</span>
                      </div>
                  </div>
              </div>
              
              <div className="text-gray-100">
                  <MarkdownRenderer content={message.content} />
              </div>

              {message.citations && message.citations.length > 0 && (
                <div className="mt-6 pt-4 border-t border-white/5 flex flex-wrap gap-2">
                    {message.citations.map((cite, i) => (
                        <a 
                          key={i} 
                          href={cite.uri} 
                          target="_blank" 
                          rel="noreferrer"
                          className="flex items-center gap-1.5 text-[10px] bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 rounded-lg transition-colors text-amber-300 border border-amber-500/20"
                        >
                            <ExternalLink size={10} /> {cite.title || 'Source'}
                        </a>
                    ))}
                </div>
            )}
            
            {/* Fallacy Alert inside Guest Bubble */}
            <AnimatePresence>
                {message.fallacy && (
                    <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-6 p-4 bg-red-900/10 border border-red-500/30 rounded-xl flex items-start gap-4 overflow-hidden"
                    >
                        <div className="p-2 bg-red-500/10 rounded-full">
                            <ShieldAlert className="text-red-500" size={20} />
                        </div>
                        <div>
                            <div className="text-red-400 text-xs font-bold uppercase tracking-widest mb-1">Logical Fallacy Detected: {message.fallacy.name}</div>
                            <div className="text-red-200/80 text-sm leading-relaxed">{message.fallacy.reason}</div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
          </div>
      </motion.div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20, x: isUser ? 20 : -20 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`max-w-[85%] md:max-w-[75%] relative group`}>
        {!isUser && agent && (
             <div className="flex items-center gap-2 mb-2 ml-1">
                 <span className={`text-[10px] font-bold uppercase tracking-wider ${agent.avatarColor.replace('bg-', 'text-')}`}>{agent.name}</span>
                 <span className="text-[10px] text-gray-600">|</span>
                 <span className="text-[10px] text-gray-500">{agent.role}</span>
             </div>
        )}

        <div className={`
            rounded-3xl p-6 shadow-lg backdrop-blur-sm border
            ${isUser 
                ? 'bg-gradient-to-br from-blue-600/20 to-blue-900/20 border-blue-500/30 text-blue-50 rounded-br-none' 
                : 'bg-white/5 border-white/10 text-gray-100 rounded-bl-none hover:bg-white/10 transition-colors'
            }
        `}>
            <div className={`whitespace-pre-wrap ${!isExpanded && isLong ? 'max-h-[150px] overflow-hidden relative' : ''}`}>
                <MarkdownRenderer content={message.content} />
                {!isExpanded && isLong && (
                    <div className="absolute bottom-0 left-0 w-full h-16 bg-gradient-to-t from-[#0a0a0a]/90 to-transparent" />
                )}
            </div>
            
            {isLong && (
                <button 
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="mt-3 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity"
                >
                    {isExpanded ? <><ChevronUp size={12}/> Collapse</> : <><ChevronDown size={12}/> Expand</>}
                </button>
            )}

            {message.citations && message.citations.length > 0 && (
                <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap gap-2">
                    {message.citations.map((cite, i) => (
                        <a 
                          key={i} 
                          href={cite.uri} 
                          target="_blank" 
                          rel="noreferrer"
                          className="flex items-center gap-1.5 text-[10px] bg-black/40 hover:bg-black/60 px-3 py-1.5 rounded-lg transition-colors text-blue-300 truncate max-w-[200px] border border-white/5"
                        >
                            <ExternalLink size={10} /> {cite.title || 'Source'}
                        </a>
                    ))}
                </div>
            )}

            {/* Logical Fallacy Alert */}
            <AnimatePresence>
                {message.fallacy && (
                    <motion.div 
                        initial={{ opacity: 0, height: 0, marginTop: 0 }}
                        animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                        className="pt-4 border-t border-white/10 overflow-hidden"
                    >
                        <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                            <ShieldAlert className="text-red-500 shrink-0" size={16} />
                            <div>
                                <div className="text-red-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                                    {message.fallacy.name} Detected
                                </div>
                                <div className="text-red-200/80 text-xs leading-relaxed">
                                    {message.fallacy.reason}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
};

const VerdictOverlay: React.FC<{ state: DebateState; agents: Agent[]; onFollowUp: (q: string) => void }> = ({ state, agents, onFollowUp }) => {
    const [followUp, setFollowUp] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);
    
    if (!state.finalVerdict) return null;

    const winner = agents.find(a => a.id === state.finalVerdict?.winnerId);
    
    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-40 bg-[#050505]/95 backdrop-blur-xl flex flex-col p-4 md:p-8 overflow-y-auto custom-scrollbar"
        >
            <div className="max-w-5xl w-full mx-auto pb-20">
                <header className="text-center space-y-4 my-10 relative">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-yellow-500/10 rounded-full blur-[80px] -z-10" />
                    <motion.div 
                        initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} 
                        transition={{ type: "spring", delay: 0.2 }}
                        className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-b from-yellow-400 to-yellow-600 text-black shadow-[0_0_50px_rgba(234,179,8,0.4)] mb-4"
                    >
                        <Trophy size={48} fill="currentColor" />
                    </motion.div>
                    <h2 className="text-5xl md:text-7xl font-black text-white tracking-tighter">VERDICT REACHED</h2>
                    <p className="text-gray-400 font-mono text-sm">Session Cost: <span className="text-emerald-400">${state.tokenUsage.totalCost.toFixed(4)}</span></p>
                </header>

                <div className="grid md:grid-cols-12 gap-6 mb-8">
                    {/* Winner Card */}
                    <motion.div 
                        initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}
                        className="md:col-span-4 glass-panel p-8 rounded-3xl border-yellow-500/30 bg-gradient-to-b from-yellow-900/10 to-transparent flex flex-col items-center text-center relative overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />
                        <div className="relative z-10">
                            <div className="text-xs font-bold text-yellow-500 uppercase tracking-[0.2em] mb-6">Winning Perspective</div>
                            <div className={`w-32 h-32 rounded-3xl ${winner?.avatarColor || 'bg-gray-700'} flex items-center justify-center text-5xl font-bold text-white shadow-2xl mb-6 ring-4 ring-yellow-500/20`}>
                                {winner?.name.charAt(0)}
                            </div>
                            <h3 className="text-2xl font-bold text-white">{winner?.name}</h3>
                            <p className="text-sm text-yellow-500/80 mt-2 font-medium">{winner?.role}</p>
                        </div>
                    </motion.div>

                    {/* Summary Card */}
                    <motion.div 
                        initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }}
                        className="md:col-span-8 glass-panel p-8 rounded-3xl flex flex-col gap-6"
                    >
                        <div className="flex items-center gap-3">
                             <div className="p-3 bg-purple-500/10 rounded-xl">
                                <Quote size={24} className="text-purple-400" />
                             </div>
                             <h3 className="text-2xl font-bold text-white">Chairperson's Synthesis</h3>
                        </div>
                        <p className="text-gray-200 leading-relaxed text-lg font-light border-l-2 border-purple-500/30 pl-6">
                            {state.finalVerdict.summary}
                        </p>
                        
                        <div className="grid grid-cols-1 gap-3 mt-auto">
                            {state.finalVerdict.keyTakeaways.map((point, i) => (
                                <div key={i} className="flex items-start gap-4 p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                                    <div className="mt-1.5 w-2 h-2 rounded-full bg-purple-400 shrink-0 shadow-[0_0_10px_rgba(168,85,247,0.5)]" />
                                    <p className="text-sm text-gray-300">{point}</p>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </div>

                {/* Follow Up Chat Interface */}
                <div className="glass-panel rounded-3xl overflow-hidden border-t border-white/10 mt-12">
                    <div className="p-6 border-b border-white/10 bg-white/5 flex items-center gap-3">
                        <Sparkles className="text-purple-400" size={20} />
                        <h3 className="text-lg font-bold text-white">Post-Debate Q&A</h3>
                    </div>
                    
                    <div className="max-h-[400px] overflow-y-auto p-6 space-y-6 bg-black/20" ref={scrollRef}>
                        {state.transcript.filter(m => m.timestamp > (state.transcript.find(t => t.phase === DebatePhase.VERDICT)?.timestamp || 0)).map(msg => (
                            <ChatBubble key={msg.id} message={msg} agents={agents} />
                        ))}
                        {state.transcript.filter(m => m.timestamp > (state.transcript.find(t => t.phase === DebatePhase.VERDICT)?.timestamp || 0)).length === 0 && (
                            <div className="text-center text-gray-500 py-10 italic">
                                Ask a follow-up question to clarify the verdict...
                            </div>
                        )}
                    </div>

                    <div className="p-6 border-t border-white/10 bg-white/5">
                        <div className="flex gap-4">
                            <input 
                                type="text" 
                                className="flex-1 bg-black/50 border border-white/10 rounded-xl px-6 py-4 text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition-all placeholder-gray-600"
                                placeholder="Type your question for the Chairperson..."
                                value={followUp}
                                onChange={(e) => setFollowUp(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        onFollowUp(followUp);
                                        setFollowUp('');
                                    }
                                }}
                            />
                            <button 
                                onClick={() => { onFollowUp(followUp); setFollowUp(''); }}
                                disabled={!followUp.trim() || state.isThinking}
                                className="bg-white text-black hover:bg-gray-200 p-4 rounded-xl disabled:opacity-50 transition-colors"
                            >
                                {state.isThinking ? <Loader2 className="animate-spin" size={24} /> : <Send size={24} />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

const DebateView: React.FC<DebateViewProps> = ({ agents, state, onStop, onFollowUp, onConsultationChoice, directorActions }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [directorOpen, setDirectorOpen] = useState(false);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
        setTimeout(() => {
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
        }, 150);
    }
  }, [state.transcript.length, state.phase]);

  // Split agents
  const leftAgents = agents.filter((_, i) => i % 2 === 0);
  const rightAgents = agents.filter((_, i) => i % 2 !== 0);

  return (
    <div className="h-screen flex flex-col bg-[#050505] overflow-hidden relative font-sans text-gray-100">
      <VerdictOverlay state={state} agents={agents} onFollowUp={onFollowUp} />
      <DirectorConsole isOpen={directorOpen} setIsOpen={setDirectorOpen} state={state} actions={directorActions} />

      {/* Cinematic Background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,#1e1b4b,transparent_60%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-15 pointer-events-none mix-blend-overlay" />
      
      {/* Top Bar */}
      <header className="z-30 px-6 py-4 flex justify-between items-center bg-[#050505]/80 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center gap-4">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_#22c55e]" />
            <h1 className="text-sm font-bold text-gray-300 tracking-wider uppercase truncate max-w-md" title={state.topic}>
                {state.topic}
            </h1>
        </div>
        <div className="flex items-center gap-4">
             {state.phase !== DebatePhase.VERDICT && (
                <button 
                    onClick={onStop} 
                    className="text-xs font-bold text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/50 bg-red-500/10 px-4 py-2 rounded-lg flex items-center gap-2 transition-all"
                >
                    <OctagonX size={14} /> STOP
                </button>
             )}
             <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                <DollarSign size={12} className="text-emerald-400" /> 
                <span className="text-xs font-mono text-gray-300">{state.tokenUsage.totalCost.toFixed(4)}</span>
             </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative z-10">
        
        {/* Left Agent Rail */}
        <div className="hidden md:flex flex-col justify-center gap-8 w-64 pl-8 z-20">
            {leftAgents.map(agent => (
                <AgentSpotlight 
                    key={agent.id} 
                    agent={agent} 
                    isActive={state.currentTurnAgentId === agent.id}
                    isThinking={state.isThinking && state.currentTurnAgentId === agent.id}
                    align="left" 
                />
            ))}
        </div>

        {/* Central Stage (Transcript) */}
        <div className="flex-1 flex flex-col relative max-w-4xl mx-auto w-full">
            {/* Phase Badge */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30">
                 <div className="px-6 py-2 rounded-full bg-black/50 backdrop-blur-xl border border-white/10 shadow-xl flex items-center gap-2">
                    <Scale size={14} className="text-purple-400" />
                    <span className="text-xs font-bold uppercase tracking-widest text-white">{state.phase}</span>
                 </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 md:px-12 py-20 custom-scrollbar scroll-smooth" ref={scrollRef}>
                <AnimatePresence mode='popLayout'>
                    {state.transcript.map((msg, index) => {
                        // Check if we should show a phase header
                        const prevMsg = state.transcript[index - 1];
                        const showPhaseHeader = msg.phase && msg.phase !== DebatePhase.SETUP && (!prevMsg || prevMsg.phase !== msg.phase);
                        
                        return (
                            <React.Fragment key={msg.id}>
                                {showPhaseHeader && <PhaseHeader phase={msg.phase!} />}
                                <ChatBubble message={msg} agents={agents} />
                            </React.Fragment>
                        );
                    })}
                </AnimatePresence>
                
                {state.isThinking && (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        className="flex justify-center mt-4"
                    >
                        <div className="flex items-center gap-3 px-6 py-3 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
                            <Loader2 className="animate-spin text-purple-400" size={16} />
                            <span className="text-xs font-medium text-gray-300 animate-pulse">
                                {state.summonedGuest 
                                    ? `Summoning Guest Expert: ${state.summonedGuest.name}...` 
                                    : state.phase === DebatePhase.VOTING 
                                        ? "Council is deliberating..." 
                                        : state.currentTurnAgentId === 'ORCHESTRATOR'
                                            ? "Chairperson is evaluating..."
                                            : `${agents.find(a => a.id === state.currentTurnAgentId)?.name || 'Someone'} is thinking...`
                                }
                            </span>
                        </div>
                    </motion.div>
                )}
            </div>
            
            {/* Consultation Timer Overlay */}
            <AnimatePresence>
                {state.showConsultationPrompt && onConsultationChoice && (
                    <ConsultationPrompt onChoice={onConsultationChoice} />
                )}
            </AnimatePresence>

            {/* Bottom fade for immersion */}
            <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-[#050505] to-transparent pointer-events-none" />
            <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-[#050505] to-transparent pointer-events-none" />
        </div>

        {/* Right Agent Rail */}
        <div className="hidden md:flex flex-col justify-center gap-8 w-64 pr-8 items-end z-20">
             {rightAgents.map(agent => (
                <AgentSpotlight 
                    key={agent.id} 
                    agent={agent} 
                    isActive={state.currentTurnAgentId === agent.id}
                    isThinking={state.isThinking && state.currentTurnAgentId === agent.id}
                    align="right" 
                />
            ))}
        </div>
      </div>
    </div>
  );
};

export default DebateView;