'use client';

import { useState } from 'react';

export default function DomainsPage() {
    const [showAdd, setShowAdd] = useState(false);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Domains</h1>
                    <p className="text-sm text-slate-400 mt-2">Register and verify properties where your guides will run.</p>
                </div>
                <button
                    onClick={() => setShowAdd(true)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-lg shadow-indigo-600/20 transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                >
                    <span className="text-lg leading-none">+</span> Add Domain
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
                            placeholder="Search domains..."
                            className="w-full bg-slate-900/50 border border-slate-700 text-white rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-600"
                        />
                    </div>
                </div>

                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-900/80 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-white/5">
                        <tr>
                            <th className="px-8 py-5">Domain Property</th>
                            <th className="px-8 py-5">Status</th>
                            <th className="px-8 py-5">Verified At</th>
                            <th className="px-8 py-5 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        <tr>
                            <td colSpan={4} className="px-8 py-20 text-center">
                                <div className="flex flex-col items-center justify-center">
                                    <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-2xl mb-4 shadow-inner">
                                        🌐
                                    </div>
                                    <h4 className="text-white font-medium text-lg">No domains configured</h4>
                                    <p className="text-slate-400 text-sm mt-1 max-w-sm mx-auto">Add a domain to receive an installation snippet and begin authoring guides.</p>
                                    <button
                                        onClick={() => setShowAdd(true)}
                                        className="mt-6 text-indigo-400 font-medium hover:text-indigo-300 transition-colors"
                                    >
                                        Add your first domain &rarr;
                                    </button>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {showAdd && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                    <div className="w-full max-w-md glass-panel rounded-3xl p-8 shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-white tracking-tight">Add Domain</h2>
                            <button onClick={() => setShowAdd(false)} className="text-slate-500 hover:text-white transition-colors">✕</button>
                        </div>

                        <div className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Domain Name or Origin</label>
                                <input
                                    type="text"
                                    placeholder="e.g. app.yourcompany.com"
                                    className="w-full bg-slate-900/80 border border-slate-700 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                                    autoFocus
                                />
                                <p className="text-xs text-slate-500 mt-2">Exclude protocol (http/https) and paths. Root domain only.</p>
                            </div>

                            <div className="pt-4 border-t border-white/5 flex gap-3">
                                <button
                                    onClick={() => setShowAdd(false)}
                                    className="flex-1 bg-slate-800/80 hover:bg-slate-700 text-white py-3 rounded-xl text-sm font-medium transition-colors border border-white/5"
                                >
                                    Cancel
                                </button>
                                <button className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl text-sm font-medium shadow-lg shadow-indigo-600/20 transition-all active:scale-95">
                                    Register Domain
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
