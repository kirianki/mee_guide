'use client';

export default function OverviewPage() {
    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out fill-mode-both">
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard title="Verified Domains" value="0" icon="🌐" trend="+0%" color="from-blue-500 to-cyan-400" delay="0ms" />
                <StatCard title="Active Guides" value="0" icon="📝" trend="+0%" color="from-indigo-500 to-violet-500" delay="100ms" />
                <StatCard title="Total Requests" value="0" icon="⚡" trend="+0%" color="from-amber-400 to-orange-500" delay="200ms" />
            </div>

            {/* Main Dashboard Canvas Wrapper */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                <div className="xl:col-span-2 space-y-8">
                    {/* Activity or Chart Area */}
                    <div className="glass-panel rounded-3xl p-8 relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500/50 to-transparent"></div>
                        <div className="flex justify-between items-center mb-8">
                            <h3 className="text-xl font-bold text-white tracking-tight">Recent Activity</h3>
                            <button className="text-sm font-medium text-indigo-400 hover:text-indigo-300 transition-colors">View All &rarr;</button>
                        </div>

                        <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-slate-700/50 rounded-2xl bg-slate-800/20">
                            <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4 shadow-inner">
                                <span className="text-2xl opacity-50">📈</span>
                            </div>
                            <p className="text-slate-400 font-medium">No activity data yet</p>
                            <p className="text-slate-500 text-sm mt-1">Deploy a guide to start gathering metrics.</p>
                        </div>
                    </div>
                </div>

                <div className="xl:col-span-1 space-y-8">
                    {/* Getting Started Panel */}
                    <div className="glass-panel rounded-3xl p-8 bg-gradient-to-b from-slate-900/80 to-slate-900/40 relative overflow-hidden">
                        <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>

                        <h3 className="text-xl font-bold text-white mb-6 tracking-tight flex items-center gap-3">
                            <span className="text-2xl">🚀</span> Quick Start
                        </h3>

                        <div className="space-y-4">
                            <QuickStartCard
                                step="1"
                                title="Add a domain"
                                desc="Register your target website"
                                active={true}
                            />
                            <div className="ml-5 w-0.5 h-4 bg-slate-700"></div>
                            <QuickStartCard
                                step="2"
                                title="Author a guide"
                                desc="Create interactive walk-throughs"
                                active={false}
                            />
                            <div className="ml-5 w-0.5 h-4 bg-slate-700"></div>
                            <QuickStartCard
                                step="3"
                                title="Install snippet"
                                desc="Add our script to your site"
                                active={false}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value, icon, trend, color, delay }: { title: string; value: string; icon: string; trend: string; color: string; delay: string }) {
    return (
        <div
            className="glass-panel p-6 rounded-3xl group hover:border-indigo-500/30 transition-all duration-300 relative overflow-hidden flex flex-col justify-between h-40 animate-in fade-in zoom-in-95 fill-mode-both"
            style={{ animationDelay: delay, animationDuration: '600ms' }}
        >
            {/* Top gradient glow line */}
            <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${color} opacity-50 group-hover:opacity-100 transition-opacity`}></div>

            <div className="flex justify-between items-start">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} bg-opacity-10 flex items-center justify-center text-2xl shadow-inner relative`}>
                    <div className="absolute inset-0 bg-white/10 rounded-xl"></div>
                    {icon}
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold tracking-wide">
                    ↑ {trend}
                </div>
            </div>

            <div className="mt-4">
                <p className="text-slate-400 text-sm font-medium tracking-wide">{title}</p>
                <div className="flex items-end gap-2 mt-1">
                    <h4 className="text-4xl font-black text-white tracking-tight">{value}</h4>
                </div>
            </div>
        </div>
    );
}

function QuickStartCard({ step, title, desc, active }: { step: string; title: string; desc: string; active: boolean }) {
    return (
        <div className={`p-4 rounded-2xl flex gap-4 transition-all ${active ? 'bg-indigo-500/10 border border-indigo-500/20 shadow-inner' : 'bg-white/5 border border-transparent hover:bg-white/10 cursor-pointer'}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shadow-inner flex-shrink-0 ${active ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                {step}
            </div>
            <div>
                <h4 className={`font-semibold ${active ? 'text-indigo-300' : 'text-slate-300'}`}>{title}</h4>
                <p className="text-xs text-slate-500 mt-1 leading-snug">{desc}</p>
            </div>
        </div>
    )
}
