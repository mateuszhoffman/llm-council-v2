import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageCircleQuestion, Send, Radio } from 'lucide-react';
import { Agent } from '../types';

interface UserModalProps {
  question: string;
  agentId: string;
  agents: Agent[];
  onSubmit: (answer: string) => void;
}

const UserModal: React.FC<UserModalProps> = ({ question, agentId, agents, onSubmit }) => {
  const [answer, setAnswer] = useState('');
  const agent = agents.find(a => a.id === agentId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (answer.trim()) {
      onSubmit(answer);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/90 backdrop-blur-md" 
      />
      
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="relative w-full max-w-lg bg-[#0a0a0a] rounded-3xl p-1 overflow-hidden shadow-[0_0_100px_rgba(168,85,247,0.3)] ring-1 ring-white/10"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-500 to-transparent" />

        <div className="bg-[#111] rounded-[22px] p-8 relative overflow-hidden">
            {/* Background noise */}
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 pointer-events-none" />
            
            <div className="relative z-10 flex flex-col items-center text-center">
                <div className="mb-6 relative">
                     <div className="absolute inset-0 bg-purple-500 blur-xl opacity-50 rounded-full" />
                     <div className={`relative w-20 h-20 rounded-2xl ${agent?.avatarColor || 'bg-gray-500'} flex items-center justify-center text-white text-3xl font-bold shadow-2xl border border-white/20`}>
                        {agent?.name.charAt(0)}
                     </div>
                     <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-lg">
                        <Radio size={10} className="animate-pulse" /> LIVE
                     </div>
                </div>

                <h2 className="text-2xl font-bold text-white mb-2">{agent?.name}</h2>
                <p className="text-purple-300 text-sm font-medium uppercase tracking-widest mb-6 flex items-center gap-2">
                    <MessageCircleQuestion size={16} /> Requests Input
                </p>

                <div className="w-full bg-white/5 p-6 rounded-2xl border border-white/10 mb-8 text-lg text-gray-100 font-light leading-relaxed">
                    "{question}"
                </div>

                <form onSubmit={handleSubmit} className="w-full flex gap-3">
                    <input
                        autoFocus
                        type="text"
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        placeholder="Type your response..."
                        className="flex-1 bg-black/50 border border-white/20 rounded-xl px-5 py-4 text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all placeholder-gray-600"
                    />
                    <button 
                        type="submit"
                        disabled={!answer.trim()}
                        className="bg-white text-black hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed p-4 rounded-xl transition-colors shadow-lg shadow-white/10"
                    >
                        <Send size={24} />
                    </button>
                </form>
            </div>
        </div>
      </motion.div>
    </div>
  );
};

export default UserModal;