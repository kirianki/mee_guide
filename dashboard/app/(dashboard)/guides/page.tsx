'use client';

import { useState } from 'react';

export default function GuidesPage() {
    const [showCreate, setShowCreate] = useState(false);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Interactive Guides</h1>
                    <p className="text-sm text-slate-400 mt-2">Create and manage step-by-step walkthroughs for your users.</p>
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="bg-violet-600 hover:bg-violet-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-lg shadow-violet-600/20 transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                >
                    <span className="text-lg leading-none">+</span> Create Guide
                </button>
            </div>

            <div className="glass-panel rounded-3xl overflow-hidden">
                <div className="p-6 border-b border-white/5 bg-white/[0.02]">
                    <div className="relative max-w-sm">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                            🔍
                        </span>
                        <input
                            type="text"
                            placeholder="Search guides..."
                            className="w-full bg-slate-900/50 border border-slate-700 text-white rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none transition-all placeholder:text-slate-600"
                        />
                    </div>
                </div>

                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-900/80 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-white/5">
                        <tr>
                            <th className="px-8 py-5">Guide Title</th>
                            <th className="px-8 py-5">Target Context</th>
                            <th className="px-8 py-5">Steps</th>
                            <th className="px-8 py-5">Status</th>
                            <th className="px-8 py-5 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        <tr>
                            <td colSpan={5} className="px-8 py-20 text-center">
                                <div className="flex flex-col items-center justify-center">
                                    <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-2xl mb-4 shadow-inner">
                                        ✨
                                    </div>
                                    <h4 className="text-white font-medium text-lg">No guides created yet</h4>
                                    <p className="text-slate-400 text-sm mt-1 max-w-sm mx-auto">Build interactive product tours mapped directly to DOM elements on your site.</p>
                                    <button
                                        onClick={() => setShowCreate(true)}
                                        className="mt-6 text-violet-400 font-medium hover:text-violet-300 transition-colors bg-violet-400/10 px-4 py-2 rounded-lg"
                                    >
                                        Draft your first guide
                                    </button>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {showCreate && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                    <div className="w-full max-w-3xl glass-panel rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200 border-white/10">
                        {/* Modal Header */}
                        <div className="bg-slate-900/80 p-6 border-b border-white/5 flex justify-between items-center z-10 shrink-0">
                            <div>
                                <h2 className="text-2xl font-bold text-white tracking-tight">Create Guide</h2>
                                <p className="text-xs text-slate-400 mt-1">Design your flow by defining steps and UI targets.</p>
                            </div>
                            <button onClick={() => setShowCreate(false)} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors">✕</button>
                        </div>

                        {/* Editor Scrollable Area */}
                        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                            <div className="grid grid-cols-2 gap-6 p-6 rounded-2xl bg-white/[0.02] border border-white/5 shadow-inner">
                                <div className="col-span-2 md:col-span-1">
                                    <label className="block text-sm font-bold text-slate-300 mb-2">Guide Name</label>
                                    <input type="text" placeholder="e.g. Setting up two-factor auth" className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none transition-all placeholder:text-slate-600" />
                                </div>
                                <div className="col-span-2 md:col-span-1">
                                    <label className="block text-sm font-bold text-slate-300 mb-2">Target Domain</label>
                                    <select className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none transition-all text-slate-400 appearance-none classic-select">
                                        <option value="">Select verified domain...</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <label className="text-lg font-bold text-white flex items-center gap-2">
                                        <span className="text-violet-400">⚡</span> Walkthrough Steps
                                    </label>
                                    <span className="text-xs font-medium bg-slate-800 text-slate-300 px-2 py-1 rounded-md">1 step total</span>
                                </div>

                                <div className="space-y-4">
                                    <div className="p-5 rounded-2xl bg-slate-800/40 border border-slate-700 relative group transition-all hover:border-violet-500/50">
                                        {/* Step Indicator */}
                                        <div className="absolute -left-3 -top-3 w-8 h-8 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-xs font-bold text-violet-400 shadow-lg z-10 group-hover:border-violet-500/50 transition-colors">
                                            1
                                        </div>

                                        <div className="flex justify-between items-center mb-4 pl-4 border-b border-white/5 pb-3">
                                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                On-Screen Tooltip
                                            </span>
                                            <button className="text-xs font-medium text-slate-500 hover:text-red-400 transition-colors flex items-center gap-1">
                                                🗑️ Remove
                                            </button>
                                        </div>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs font-medium text-slate-500 mb-1.5 ml-1">Instruction Text</label>
                                                <textarea placeholder="Tell your user what to do here..." className="w-full bg-slate-900/60 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-all min-h-[80px] resize-y" />
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-medium text-slate-500 mb-1.5 ml-1">UI CSS Selector (Optional)</label>
                                                    <input type="text" placeholder=".nav-item-login, #submit-btn" className="w-full bg-slate-900/60 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-all font-mono placeholder:font-sans" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-slate-500 mb-1.5 ml-1">AI Semantic Target (Optional)</label>
                                                    <input type="text" placeholder="e.g. The green confirm button" className="w-full bg-slate-900/60 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-all" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <button className="w-full py-4 bg-slate-800/20 border-2 border-dashed border-slate-700 hover:border-violet-500/50 hover:bg-violet-500/5 text-slate-400 hover:text-violet-300 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 mt-2">
                                        <span className="text-lg">+</span> Add Another Step
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="bg-slate-900/80 p-6 border-t border-white/5 flex gap-4 shrink-0 shrink-0">
                            <button
                                onClick={() => setShowCreate(false)}
                                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-3.5 rounded-xl text-sm font-bold transition-colors"
                            >
                                Cancel Draft
                            </button>
                            <button className="flex-[2] bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white py-3.5 rounded-xl text-sm font-bold shadow-lg shadow-violet-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]">
                                Publish Guide 🎉
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
