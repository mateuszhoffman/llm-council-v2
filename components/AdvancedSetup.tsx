import React, { useState, useEffect } from 'react';
import { Agent, AgentRole, SavedCouncil } from '../types';
import { generateCouncilFromTheme } from '../services/geminiService';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Save, Wand2, Trash2, Edit2, Users, FolderOpen, ArrowRight, Loader2, RefreshCw, Cpu } from 'lucide-react';
import { PRESET_AGENTS } from '../constants';
import { v4 as uuidv4 } from 'uuid';

interface AdvancedSetupProps {
    isOpen: boolean;
    onClose: () => void;
    onApply: (agents: Agent[]) => void;
}

const ROLES = Object.values(AgentRole);
const COLORS = [
    'bg-emerald-500', 'bg-rose-500', 'bg-violet-500', 'bg-blue-500', 
    'bg-orange-500', 'bg-pink-500', 'bg-cyan-500', 'bg-amber-500', 'bg-gray-500'
];

const AdvancedSetup: React.FC<AdvancedSetupProps> = ({ isOpen, onClose, onApply }) => {
    const [mode, setMode] = useState<'LIBRARY' | 'EDITOR'>('LIBRARY');
    const [savedCouncils, setSavedCouncils] = useState<SavedCouncil[]>([]);
    
    // Editor State
    const [currentName, setCurrentName] = useState('');
    const [currentAgents, setCurrentAgents] = useState<Agent[]>([]);
    const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
    const [themePrompt, setThemePrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        const loaded = localStorage.getItem('llm_council_library');
        if (loaded) {
            setSavedCouncils(JSON.parse(loaded));
        }
    }, []);

    const saveLibrary = (councils: SavedCouncil[]) => {
        setSavedCouncils(councils);
        localStorage.setItem('llm_council_library', JSON.stringify(councils));
    };

    const handleCreateNew = () => {
        setCurrentName('New Council');
        setCurrentAgents([PRESET_AGENTS[0], PRESET_AGENTS[1]]);
        setMode('EDITOR');
    };

    const handleLoad = (council: SavedCouncil) => {
        setCurrentName(council.name);
        setCurrentAgents(council.agents);
        setMode('EDITOR');
    };

    const handleDeleteSaved = (id: string) => {
        saveLibrary(savedCouncils.filter(c => c.id !== id));
    };

    const handleSaveCurrent = () => {
        const newCouncil: SavedCouncil = {
            id: uuidv4(),
            name: currentName || 'Untitled Council',
            agents: currentAgents,
            lastModified: Date.now()
        };
        // Check if updating existing by name (simple dedupe for now) or just push
        const existingIdx = savedCouncils.findIndex(c => c.name === newCouncil.name);
        let updated = [...savedCouncils];
        if (existingIdx >= 0) {
            updated[existingIdx] = newCouncil;
        } else {
            updated.push(newCouncil);
        }
        saveLibrary(updated);
        // Toast or feedback could go here
    };

    const handleAiGenerate = async () => {
        if (!themePrompt) return;
        setIsGenerating(true);
        try {
            const agents = await generateCouncilFromTheme(themePrompt, 4);
            setCurrentAgents(agents);
            if (!currentName || currentName === 'New Council') {
                setCurrentName(themePrompt);
            }
        } finally {
            setIsGenerating(false);
        }
    };

    const updateAgent = (agent: Agent) => {
        setCurrentAgents(prev => prev.map(a => a.id === agent.id ? agent : a));
        setEditingAgent(null);
    };

    const deleteAgent = (id: string) => {
        setCurrentAgents(prev => prev.filter(a => a.id !== id));
        if (editingAgent?.id === id) setEditingAgent(null);
    };

    const addAgent = () => {
        const newAgent: Agent = {
            id: uuidv4(),
            name: 'New Agent',
            role: AgentRole.REALIST,
            avatarColor: 'bg-gray-500',
            description: 'A new member.',
            systemPrompt: 'You are a helpful assistant.'
        };
        setCurrentAgents([...currentAgents, newAgent]);
        setEditingAgent(newAgent);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[70] bg-black/95 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-6xl h-[90vh] bg-[#0F0F12] border border-white/10 rounded-3xl flex overflow-hidden shadow-2xl"
            >
                {/* Sidebar */}
                <div className="w-64 bg-black/50 border-r border-white/10 p-6 flex flex-col">
                    <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                        <Users size={20} className="text-purple-500" /> Council HQ
                    </h2>
                    
                    <button 
                        onClick={() => setMode('LIBRARY')}
                        className={`w-full text-left px-4 py-3 rounded-xl mb-2 flex items-center gap-3 transition-colors ${mode === 'LIBRARY' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <FolderOpen size={18} /> Library
                    </button>
                    
                    <div className="mt-auto">
                        <button onClick={onClose} className="text-gray-500 hover:text-white flex items-center gap-2 text-sm px-4">
                            <X size={16} /> Close
                        </button>
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 flex flex-col overflow-hidden relative">
                    {mode === 'LIBRARY' ? (
                        <div className="p-10 flex-1 overflow-y-auto">
                            <div className="flex justify-between items-end mb-8">
                                <div>
                                    <h1 className="text-3xl font-bold text-white mb-2">Saved Councils</h1>
                                    <p className="text-gray-400">Manage your custom debate teams.</p>
                                </div>
                                <button 
                                    onClick={handleCreateNew}
                                    className="px-6 py-3 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-colors flex items-center gap-2"
                                >
                                    <Plus size={18} /> Create New
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {savedCouncils.map(council => (
                                    <div key={council.id} className="group bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-purple-500/50 transition-all">
                                        <div className="flex justify-between items-start mb-4">
                                            <h3 className="text-xl font-bold text-white">{council.name}</h3>
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => handleDeleteSaved(council.id)} className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500 hover:text-white transition-colors">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex -space-x-2 mb-6">
                                            {council.agents.slice(0, 5).map((a, i) => (
                                                <div key={i} className={`w-8 h-8 rounded-full border-2 border-[#111] ${a.avatarColor}`} />
                                            ))}
                                            {council.agents.length > 5 && (
                                                <div className="w-8 h-8 rounded-full border-2 border-[#111] bg-gray-700 flex items-center justify-center text-[10px] text-white">
                                                    +{council.agents.length - 5}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex gap-3">
                                            <button 
                                                onClick={() => handleLoad(council)} 
                                                className="flex-1 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-bold text-white transition-colors"
                                            >
                                                Edit
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    onApply(council.agents);
                                                    onClose();
                                                }}
                                                className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-bold text-white transition-colors"
                                            >
                                                Use
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {savedCouncils.length === 0 && (
                                    <div className="col-span-full py-20 text-center text-gray-500 border border-dashed border-white/10 rounded-2xl">
                                        No saved councils found. Create one to get started.
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex h-full">
                            {/* Editor Left: Agents Grid */}
                            <div className="flex-1 flex flex-col p-8 border-r border-white/10 overflow-y-auto">
                                <div className="flex justify-between items-center mb-8">
                                    <div className="flex items-center gap-4 flex-1">
                                        <input 
                                            type="text" 
                                            value={currentName}
                                            onChange={(e) => setCurrentName(e.target.value)}
                                            className="bg-transparent text-3xl font-bold text-white focus:outline-none border-b border-transparent focus:border-purple-500 transition-all w-full"
                                            placeholder="Council Name"
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={handleSaveCurrent} className="p-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-colors flex items-center gap-2 font-bold text-sm">
                                            <Save size={18} /> Save
                                        </button>
                                        <button 
                                            onClick={() => { onApply(currentAgents); onClose(); }}
                                            className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl transition-colors flex items-center gap-2 font-bold"
                                        >
                                            Apply <ArrowRight size={18} />
                                        </button>
                                    </div>
                                </div>

                                {/* AI Generator */}
                                <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-white/10 rounded-2xl p-6 mb-8">
                                    <div className="flex items-center gap-2 mb-3 text-purple-300 font-bold uppercase tracking-wider text-xs">
                                        <Wand2 size={14} /> AI Generator
                                    </div>
                                    <div className="flex gap-3">
                                        <input 
                                            value={themePrompt}
                                            onChange={(e) => setThemePrompt(e.target.value)}
                                            placeholder="E.g., 'A team of cyberpunk hackers' or 'Ancient Greek Philosophers'"
                                            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-purple-500 focus:outline-none"
                                        />
                                        <button 
                                            onClick={handleAiGenerate}
                                            disabled={isGenerating || !themePrompt}
                                            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white px-6 rounded-xl font-bold transition-colors flex items-center gap-2"
                                        >
                                            {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
                                            Generate
                                        </button>
                                    </div>
                                </div>

                                {/* Agent List */}
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                    {currentAgents.map((agent) => (
                                        <div 
                                            key={agent.id}
                                            onClick={() => setEditingAgent(agent)}
                                            className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-4 ${editingAgent?.id === agent.id ? 'bg-white/10 border-purple-500' : 'bg-white/5 border-white/10 hover:border-white/30'}`}
                                        >
                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold text-white shrink-0 ${agent.avatarColor}`}>
                                                {agent.name.charAt(0)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-bold text-white truncate">{agent.name}</h4>
                                                <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">{agent.role}</div>
                                                <p className="text-xs text-gray-500 truncate">{agent.description}</p>
                                            </div>
                                            {currentAgents.length > 2 && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); deleteAgent(agent.id); }}
                                                    className="p-2 text-gray-600 hover:text-red-400 transition-colors"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    {currentAgents.length < 5 && (
                                        <button 
                                            onClick={addAgent}
                                            className="p-4 rounded-xl border border-dashed border-white/10 hover:border-white/30 hover:bg-white/5 transition-all flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-white"
                                        >
                                            <Plus size={24} />
                                            <span className="font-bold text-sm">Add Agent</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Editor Right: Details */}
                            <div className="w-96 bg-black/20 p-8 border-l border-white/10 overflow-y-auto">
                                {editingAgent ? (
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                                <Edit2 size={16} /> Edit Profile
                                            </h3>
                                            <div className={`w-8 h-8 rounded-lg ${editingAgent.avatarColor}`} />
                                        </div>

                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-xs font-bold text-gray-500 uppercase">Name</label>
                                                <input 
                                                    className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:border-purple-500 focus:outline-none mt-1"
                                                    value={editingAgent.name}
                                                    onChange={(e) => setEditingAgent({ ...editingAgent, name: e.target.value })}
                                                    onBlur={() => updateAgent(editingAgent)}
                                                />
                                            </div>

                                            <div>
                                                <label className="text-xs font-bold text-gray-500 uppercase">Role</label>
                                                <select 
                                                    className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:border-purple-500 focus:outline-none mt-1"
                                                    value={editingAgent.role}
                                                    onChange={(e) => {
                                                        const newAgent = { ...editingAgent, role: e.target.value as AgentRole };
                                                        setEditingAgent(newAgent);
                                                        updateAgent(newAgent);
                                                    }}
                                                >
                                                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                                </select>
                                            </div>
                                            
                                            <div>
                                                <div className="flex justify-between items-center mb-1">
                                                     <label className="text-xs font-bold text-gray-500 uppercase">Model Override</label>
                                                     <Cpu size={12} className="text-gray-500" />
                                                </div>
                                                <input 
                                                    className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:border-purple-500 focus:outline-none placeholder-gray-600 font-mono text-xs"
                                                    value={editingAgent.modelOverride || ''}
                                                    onChange={(e) => setEditingAgent({ ...editingAgent, modelOverride: e.target.value })}
                                                    onBlur={() => updateAgent(editingAgent)}
                                                    placeholder="Default (Inherit)"
                                                />
                                                <p className="text-[10px] text-gray-500 mt-1">
                                                    Optional. Enter a Model ID (e.g. gemini-2.5-flash) to force this agent to use a specific model.
                                                </p>
                                            </div>

                                            <div>
                                                <label className="text-xs font-bold text-gray-500 uppercase">Description</label>
                                                <textarea 
                                                    className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:border-purple-500 focus:outline-none mt-1 text-sm h-20 resize-none"
                                                    value={editingAgent.description}
                                                    onChange={(e) => setEditingAgent({ ...editingAgent, description: e.target.value })}
                                                    onBlur={() => updateAgent(editingAgent)}
                                                />
                                            </div>

                                            <div>
                                                <label className="text-xs font-bold text-gray-500 uppercase">System Prompt</label>
                                                <textarea 
                                                    className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:border-purple-500 focus:outline-none mt-1 text-sm h-40 font-mono leading-relaxed resize-none"
                                                    value={editingAgent.systemPrompt}
                                                    onChange={(e) => setEditingAgent({ ...editingAgent, systemPrompt: e.target.value })}
                                                    onBlur={() => updateAgent(editingAgent)}
                                                />
                                            </div>

                                            <div>
                                                <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Avatar Color</label>
                                                <div className="flex flex-wrap gap-2">
                                                    {COLORS.map(c => (
                                                        <button 
                                                            key={c}
                                                            onClick={() => {
                                                                const newAgent = { ...editingAgent, avatarColor: c };
                                                                setEditingAgent(newAgent);
                                                                updateAgent(newAgent);
                                                            }}
                                                            className={`w-6 h-6 rounded-full ${c} ${editingAgent.avatarColor === c ? 'ring-2 ring-white' : ''}`}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-600 text-center">
                                        <Edit2 size={48} className="mb-4 opacity-20" />
                                        <p>Select an agent to edit details.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

export default AdvancedSetup;
