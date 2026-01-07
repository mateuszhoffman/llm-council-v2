import React, { useState, useEffect } from 'react';
import { Agent, DebateMode, LLMConfig, OpenRouterModel } from '../types';
import { PRESET_AGENTS } from '../constants';
import { suggestCouncil, setLLMConfig, getOpenRouterModels, getEstimatedPricing } from '../services/geminiService';
import { Plus, X, Play, Users, MessageSquare, Wand2, Settings2, Calculator, CheckCircle2, Loader2, Settings, Save, Search, AlertTriangle, LayoutGrid, FileText, History, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AdvancedSetup from './AdvancedSetup';

interface ConfigViewProps {
  onStart: (topic: string, agents: Agent[], mode: DebateMode, maxRounds: number, initialContext: string) => void;
  onResume: () => void;
  hasSavedSession: boolean;
}

// Settings Modal Component
const SettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const [config, setConfig] = useState<LLMConfig>({ provider: 'GOOGLE', modelId: 'gemini-3-flash-preview' });
    const [orModels, setOrModels] = useState<OpenRouterModel[]>([]);
    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [modelSearch, setModelSearch] = useState('');

    useEffect(() => {
        const saved = localStorage.getItem('llm_council_config');
        if (saved) {
            const parsed = JSON.parse(saved);
            setConfig(parsed);
            if (parsed.provider === 'OPENROUTER' && parsed.openRouterApiKey) {
                fetchORModels(parsed.openRouterApiKey);
            }
        }
    }, []);

    const fetchORModels = async (key: string) => {
        if (!key) return;
        setIsLoadingModels(true);
        const models = await getOpenRouterModels(key);
        setOrModels(models);
        setIsLoadingModels(false);
    };

    const handleSave = () => {
        localStorage.setItem('llm_council_config', JSON.stringify(config));
        setLLMConfig(config);
        onClose();
    };

    const filteredModels = orModels.filter(m => m.name.toLowerCase().includes(modelSearch.toLowerCase()) || m.id.includes(modelSearch.toLowerCase()));

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="bg-[#111] border border-white/10 rounded-3xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
                <div className="p-6 border-b border-white/10 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Settings size={20} /> Provider Settings
                    </h2>
                    <button onClick={onClose}><X size={20} className="text-gray-500 hover:text-white" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    {/* Provider Toggle */}
                    <div className="flex bg-black/50 p-1 rounded-xl border border-white/10">
                        <button 
                            onClick={() => setConfig({ ...config, provider: 'GOOGLE' })}
                            className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all ${config.provider === 'GOOGLE' ? 'bg-white text-black shadow-lg' : 'text-gray-500 hover:text-white'}`}
                        >
                            Google Gemini
                        </button>
                        <button 
                            onClick={() => setConfig({ ...config, provider: 'OPENROUTER' })}
                            className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all ${config.provider === 'OPENROUTER' ? 'bg-white text-black shadow-lg' : 'text-gray-500 hover:text-white'}`}
                        >
                            OpenRouter
                        </button>
                    </div>

                    {/* Shared: Perplexity API Key */}
                    <div className="bg-blue-900/10 p-4 rounded-xl border border-blue-500/20">
                         <label className="block text-xs font-bold text-blue-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <Globe size={12} /> Perplexity API Key (Search Tool)
                         </label>
                         <input 
                            type="password" 
                            placeholder="pplx-..."
                            value={config.perplexityApiKey || ''}
                            onChange={(e) => setConfig({ ...config, perplexityApiKey: e.target.value })}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                        />
                        <p className="text-[10px] text-gray-500 mt-2">
                            Optional. Allows models (especially OpenRouter) to search the web via Perplexity.
                        </p>
                    </div>

                    {config.provider === 'GOOGLE' ? (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Google API Key</label>
                                <input 
                                    type="password" 
                                    placeholder="Enter your Google API Key"
                                    value={config.apiKey || ''}
                                    onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                                />
                                <p className="text-[10px] text-gray-500 mt-2">Required for Google models. Keys are stored locally in your browser.</p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Model ID</label>
                                <input 
                                    type="text" 
                                    value={config.modelId || 'gemini-3-flash-preview'}
                                    onChange={(e) => setConfig({ ...config, modelId: e.target.value })}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 font-mono"
                                />
                                <div className="mt-2 text-[10px] text-emerald-400 flex items-center gap-1">
                                    <CheckCircle2 size={10} /> Supports Google Search Grounding & Thinking
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">OpenRouter API Key</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="password" 
                                        placeholder="sk-or-..."
                                        value={config.openRouterApiKey || ''}
                                        onChange={(e) => setConfig({ ...config, openRouterApiKey: e.target.value })}
                                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                                    />
                                    <button 
                                        onClick={() => fetchORModels(config.openRouterApiKey || '')}
                                        className="bg-purple-600 hover:bg-purple-500 text-white px-4 rounded-xl font-bold"
                                    >
                                        Load
                                    </button>
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Select Model</label>
                                {isLoadingModels ? (
                                    <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-purple-500" /></div>
                                ) : (
                                    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden max-h-[300px] flex flex-col">
                                        <div className="p-2 border-b border-white/10">
                                            <div className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-2">
                                                <Search size={14} className="text-gray-500" />
                                                <input 
                                                    className="bg-transparent border-none focus:outline-none text-sm text-white w-full"
                                                    placeholder="Search models..."
                                                    value={modelSearch}
                                                    onChange={(e) => setModelSearch(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div className="overflow-y-auto flex-1">
                                            {filteredModels.map(m => (
                                                <div 
                                                    key={m.id}
                                                    onClick={() => setConfig({ ...config, modelId: m.id })}
                                                    className={`px-4 py-3 border-b border-white/5 cursor-pointer hover:bg-white/10 flex justify-between items-center ${config.modelId === m.id ? 'bg-purple-500/20' : ''}`}
                                                >
                                                    <div>
                                                        <div className="text-sm font-bold text-white">{m.name}</div>
                                                        <div className="text-[10px] text-gray-500 font-mono">{m.id}</div>
                                                    </div>
                                                    {config.modelId === m.id && <CheckCircle2 size={16} className="text-purple-400" />}
                                                </div>
                                            ))}
                                            {filteredModels.length === 0 && (
                                                <div className="p-4 text-center text-gray-500 text-xs">No models found. Enter API Key and click Load.</div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                <div className="mt-2 text-[10px] text-yellow-500 flex items-center gap-1">
                                    <AlertTriangle size={10} /> Native Search Grounding is disabled. Use Perplexity Key above for web access.
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-white/10 bg-black/40">
                    <button 
                        onClick={handleSave}
                        className="w-full py-4 bg-white text-black hover:bg-gray-200 rounded-xl font-bold flex items-center justify-center gap-2"
                    >
                        <Save size={18} /> Save Configuration
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

const ConfigView: React.FC<ConfigViewProps> = ({ onStart, onResume, hasSavedSession }) => {
  const [topic, setTopic] = useState('');
  const [initialContext, setInitialContext] = useState('');
  const [selectedAgents, setSelectedAgents] = useState<Agent[]>([PRESET_AGENTS[0], PRESET_AGENTS[1]]); 
  const [mode, setMode] = useState<DebateMode>('AUTO');
  const [maxRounds, setMaxRounds] = useState(2);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAdvancedSetupOpen, setIsAdvancedSetupOpen] = useState(false);

  // Dynamic Cost Estimation
  const [estCost, setEstCost] = useState(0);

  useEffect(() => {
    // Recalculate cost when agents, rounds, or CONFIG changes
    const configStr = localStorage.getItem('llm_council_config');
    let modelId = 'gemini-3-flash-preview';
    if (configStr) {
        try {
            modelId = JSON.parse(configStr).modelId;
        } catch(e) {}
    }

    const pricing = getEstimatedPricing(modelId);
    
    // Avg 1500 tokens input, 300 tokens output per turn
    const avgInput = 1500;
    const avgOutput = 300;
    
    const avgTurnsPerRound = selectedAgents.length;
    const numRounds = mode === 'AUTO' ? 3 : maxRounds; 
    const totalTurns = avgTurnsPerRound * numRounds;

    const tokenCostPerTurn = (avgInput * pricing.prompt) + (avgOutput * pricing.completion);
    // Rough estimate for search ($0.035 for Google, $0.005 for Perplexity) - just use 0.02 average
    const searchCostPerTurn = 0.02; 
    
    setEstCost(totalTurns * (tokenCostPerTurn + searchCostPerTurn));
  }, [selectedAgents, mode, maxRounds, isSettingsOpen]); // Re-run when settings close (potentially changed model)

  const toggleAgent = (agent: Agent) => {
    if (selectedAgents.find(a => a.id === agent.id)) {
      setSelectedAgents(selectedAgents.filter(a => a.id !== agent.id));
    } else {
      if (selectedAgents.length < 5) {
        setSelectedAgents([...selectedAgents, agent]);
      }
    }
  };

  const handleAiSuggest = async () => {
      if (!topic || topic.length < 5) return;
      setIsSuggesting(true);
      try {
          const suggestions = await suggestCouncil(topic);
          setSelectedAgents(suggestions);
      } catch (e) {
          console.error(e);
      } finally {
          setIsSuggesting(false);
      }
  };

  const canStart = topic.trim().length > 5 && selectedAgents.length >= 2;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-[#050505] selection:bg-purple-500/30">
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      
      <AdvancedSetup 
         isOpen={isAdvancedSetupOpen} 
         onClose={() => setIsAdvancedSetupOpen(false)}
         onApply={(agents) => setSelectedAgents(agents)}
      />

      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_0%,#1a103c,transparent_70%)] -z-20" />
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none -z-10" />

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-7xl w-full z-10"
      >
        <motion.header variants={itemVariants} className="mb-12 text-center space-y-4 relative">
          <button 
             onClick={() => setIsSettingsOpen(true)}
             className="absolute right-0 top-0 p-3 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 transition-colors"
          >
              <Settings size={20} className="text-gray-400" />
          </button>

          <div className="inline-flex items-center justify-center p-2 rounded-full bg-white/5 border border-white/10 mb-4 backdrop-blur-md">
             <span className="text-xs font-bold px-3 py-1 bg-purple-500 rounded-full text-white mr-2">BETA</span>
             <span className="text-xs text-gray-400 pr-2">Next-Gen Debate Orchestrator</span>
          </div>
          <h1 className="text-6xl md:text-8xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-white/40 tracking-tighter">
            LLM Council
          </h1>
          <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto font-light">
            Assemble a diverse team of AI personas to debate, research, and synthesize complex topics in real-time.
          </p>
        </motion.header>

        {hasSavedSession && (
            <motion.div variants={itemVariants} className="flex justify-center mb-8">
                <button 
                    onClick={onResume}
                    className="flex items-center gap-3 px-8 py-3 bg-gradient-to-r from-emerald-900/50 to-emerald-800/50 border border-emerald-500/30 rounded-full text-emerald-200 hover:text-white hover:border-emerald-500 transition-all group shadow-lg"
                >
                    <History size={18} className="group-hover:rotate-180 transition-transform duration-500" />
                    <span className="font-bold">Resume Previous Session</span>
                </button>
            </motion.div>
        )}

        <div className="grid lg:grid-cols-12 gap-8">
          
          {/* Left Column: Topic & Config */}
          <div className="lg:col-span-4 space-y-6 flex flex-col">
             <motion.div variants={itemVariants} className="glass-panel p-8 rounded-3xl flex flex-col gap-6 flex-1 border-t border-white/10 hover:border-purple-500/30 transition-colors duration-500">
                <div className="flex items-center gap-3 text-purple-400">
                  <div className="p-2 bg-purple-500/10 rounded-lg">
                    <MessageSquare size={24} />
                  </div>
                  <h2 className="text-xl font-bold tracking-tight text-white">Debate Topic</h2>
                </div>
                
                <div className="relative group flex-1">
                    <textarea
                      className="w-full h-full bg-black/40 border border-white/10 rounded-2xl p-6 text-lg text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none transition-all leading-relaxed"
                      placeholder="Enter a controversial or complex topic..."
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                    />
                    <div className="absolute bottom-4 right-4 text-xs text-gray-500 font-mono">
                        {topic.length} chars
                    </div>
                </div>

                <div className="bg-purple-900/10 rounded-xl p-4 border border-purple-500/20">
                    <div className="flex justify-between items-center mb-2">
                         <span className="text-xs font-bold text-purple-300 uppercase tracking-wider">AI Assistant</span>
                         <Wand2 size={14} className="text-purple-400" />
                    </div>
                    <p className="text-xs text-purple-200/70 mb-3">
                        Need help forming a council? Enter a topic and let AI pick the best experts.
                    </p>
                    <button 
                        onClick={handleAiSuggest}
                        disabled={isSuggesting || topic.length < 5}
                        className="w-full py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:hover:bg-purple-600 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2"
                    >
                        {isSuggesting ? <Loader2 className="animate-spin" size={14} /> : <Wand2 size={14} />}
                        Auto-Assemble Council
                    </button>
                </div>
             </motion.div>
          </div>

          {/* Middle Column: Council Selection */}
          <div className="lg:col-span-5 space-y-6 flex flex-col">
            <motion.div variants={itemVariants} className="glass-panel p-8 rounded-3xl h-full flex flex-col border-t border-white/10">
                <div className="flex items-center justify-between mb-6 text-blue-400">
                  <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-500/10 rounded-lg">
                        <Users size={24} />
                      </div>
                      <div>
                          <h2 className="text-xl font-bold tracking-tight text-white">The Council</h2>
                          <p className="text-xs text-gray-500">Select up to 5 members</p>
                      </div>
                  </div>
                  <button 
                    onClick={() => setIsAdvancedSetupOpen(true)}
                    className="p-2 bg-blue-500/20 hover:bg-blue-500 hover:text-white text-blue-400 rounded-lg transition-colors flex items-center gap-2 text-xs font-bold"
                  >
                      <LayoutGrid size={16} /> Advanced Setup
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3 max-h-[400px]">
                  <AnimatePresence>
                      {/* Active Agents */}
                      {selectedAgents.map(agent => (
                        <motion.div 
                            layout
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            key={agent.id} 
                            className="group relative flex items-center p-3 rounded-2xl border border-blue-500/30 bg-gradient-to-r from-blue-900/20 to-transparent hover:from-blue-900/40 transition-all cursor-pointer"
                            onClick={() => toggleAgent(agent)}
                        >
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-bold mr-4 ${agent.avatarColor} text-white shadow-lg group-hover:scale-105 transition-transform`}>
                            {agent.name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-white text-base truncate">{agent.name}</h3>
                            <p className="text-xs text-blue-200/70 truncate">{agent.role}</p>
                            </div>
                            <div className="p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <X size={18} className="text-white/50 hover:text-white" />
                            </div>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                <CheckCircle2 className="text-blue-500" size={20} />
                            </div>
                        </motion.div>
                      ))}
                  </AnimatePresence>

                  {selectedAgents.length < 5 && (
                      <div className="pt-4 mt-4 border-t border-white/5">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Available Personas</h3>
                        <div className="grid gap-2">
                            {PRESET_AGENTS.filter(p => !selectedAgents.find(s => s.id === p.id)).map(agent => (
                                <button
                                    key={agent.id}
                                    onClick={() => toggleAgent(agent)}
                                    className="flex items-center p-2 rounded-xl hover:bg-white/5 transition-all text-left border border-transparent hover:border-white/5 group"
                                >
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold mr-3 ${agent.avatarColor} text-white opacity-50 grayscale group-hover:grayscale-0 group-hover:opacity-100 transition-all`}>
                                    {agent.name.charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                    <h3 className="text-gray-400 group-hover:text-gray-200 text-sm font-medium transition-colors">{agent.name}</h3>
                                    </div>
                                    <Plus size={16} className="text-gray-600 group-hover:text-white transition-colors" />
                                </button>
                            ))}
                        </div>
                      </div>
                  )}
                </div>

                {/* Initial Context Input */}
                <div className="mt-4 pt-4 border-t border-white/10">
                    <div className="flex items-center gap-2 mb-2 text-blue-400">
                        <FileText size={16} />
                        <span className="text-xs font-bold uppercase tracking-wider">Reference Material (Optional)</span>
                    </div>
                    <textarea 
                        value={initialContext}
                        onChange={(e) => setInitialContext(e.target.value)}
                        placeholder="Paste research data, facts, or specific constraints here to inject into all agents..."
                        className="w-full h-24 bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:border-blue-500 focus:outline-none resize-none"
                    />
                </div>
            </motion.div>
          </div>

          {/* Right Column: Mode & Launch */}
          <div className="lg:col-span-3 space-y-6 flex flex-col">
              <motion.div variants={itemVariants} className="glass-panel p-8 rounded-3xl flex flex-col gap-8 h-full border-t border-white/10">
                  <div className="flex items-center gap-3 text-emerald-400">
                      <div className="p-2 bg-emerald-500/10 rounded-lg">
                        <Settings2 size={24} />
                      </div>
                      <h2 className="text-xl font-bold tracking-tight text-white">Mode</h2>
                  </div>

                  <div className="space-y-4">
                      <div 
                        onClick={() => setMode('AUTO')}
                        className={`p-4 rounded-xl border cursor-pointer transition-all ${mode === 'AUTO' ? 'bg-emerald-500/20 border-emerald-500/50' : 'bg-black/20 border-white/10 hover:bg-white/5'}`}
                      >
                          <div className="flex justify-between items-center mb-1">
                              <span className={`font-bold ${mode === 'AUTO' ? 'text-white' : 'text-gray-400'}`}>Auto-Pilot</span>
                              {mode === 'AUTO' && <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
                          </div>
                          <p className="text-xs text-gray-500 leading-relaxed">
                              AI Orchestrator decides when to conclude based on consensus quality.
                          </p>
                      </div>

                      <div 
                        onClick={() => setMode('FIXED')}
                        className={`p-4 rounded-xl border cursor-pointer transition-all ${mode === 'FIXED' ? 'bg-emerald-500/20 border-emerald-500/50' : 'bg-black/20 border-white/10 hover:bg-white/5'}`}
                      >
                          <div className="flex justify-between items-center mb-1">
                              <span className={`font-bold ${mode === 'FIXED' ? 'text-white' : 'text-gray-400'}`}>Fixed Rounds</span>
                              {mode === 'FIXED' && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                          </div>
                          <p className="text-xs text-gray-500 leading-relaxed">
                              Force a specific number of debate cycles before voting.
                          </p>
                      </div>
                  </div>

                  {mode === 'FIXED' && (
                     <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                        <div className="flex justify-between text-xs text-gray-400 mb-2 font-bold uppercase tracking-wider">
                            <span>Duration</span>
                            <span className="text-white">{maxRounds} Rounds</span>
                        </div>
                        <input 
                            type="range" min="1" max="5" step="1" 
                            value={maxRounds} 
                            onChange={(e) => setMaxRounds(parseInt(e.target.value))}
                            className="w-full accent-emerald-500 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
                        />
                     </motion.div>
                  )}

                  <div className="mt-auto pt-6 border-t border-white/10 space-y-2">
                      <div className="flex items-center justify-between text-gray-400">
                          <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-bold">
                              <Calculator size={14} /> Est. Cost
                          </div>
                          <span className="text-emerald-400 font-mono text-base font-bold">~${estCost.toFixed(2)}</span>
                      </div>
                      <div className="text-[10px] text-gray-600 text-right">
                          Estimated based on {mode === 'AUTO' ? 3 : maxRounds} rounds.
                      </div>
                  </div>
              </motion.div>
          </div>
        </div>

        <motion.div 
          className="mt-12 flex justify-center pb-12"
          variants={itemVariants}
        >
          <button
            disabled={!canStart}
            onClick={() => onStart(topic, selectedAgents, mode, maxRounds, initialContext)}
            className={`
                relative group flex items-center gap-4 px-12 py-6 rounded-full font-bold text-2xl tracking-tight transition-all duration-500
                ${canStart 
                    ? 'bg-white text-black hover:scale-105 shadow-[0_0_50px_rgba(255,255,255,0.3)] hover:shadow-[0_0_80px_rgba(255,255,255,0.5)]' 
                    : 'bg-white/5 text-gray-600 cursor-not-allowed border border-white/5'
                }
            `}
          >
            <span className="relative z-10">Start Session</span>
            <div className={`p-2 rounded-full ${canStart ? 'bg-black text-white' : 'bg-white/10'} transition-colors`}>
                <Play size={20} className={canStart ? "fill-white" : "fill-transparent"} />
            </div>
          </button>
        </motion.div>
      </motion.div>
      
      {/* Loader for AI Suggest */}
      <AnimatePresence>
        {isSuggesting && (
            <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center"
            >
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="animate-spin text-purple-500" size={48} />
                    <p className="text-purple-200 text-lg font-light animate-pulse">Consulting the archives...</p>
                </div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ConfigView;