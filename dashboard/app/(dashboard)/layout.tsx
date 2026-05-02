'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

const NAV_ITEMS = [
    { name: 'Overview', href: '/', icon: '📊' },
    { name: 'Domains', href: '/domains', icon: '🌐' },
    { name: 'Guides', href: '/guides', icon: '📝' },
    { name: 'Settings', href: '/settings', icon: '⚙️' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            router.replace('/login');
        } else {
            setLoading(false);
        }
    }, [router]);

    if (loading) return (
        <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
        </div>
    );

    return (
        <div className="flex h-screen bg-[#0f172a] bg-[radial-gradient(ellipse_edge_at_top_right,rgba(120,119,198,0.05),transparent)] text-slate-200 overflow-hidden font-sans">
            {/* Sidebar */}
            <aside className="w-72 bg-slate-900/60 backdrop-blur-3xl border-r border-white/5 flex flex-col shadow-2xl z-20">
                <div className="p-8">
                    <div className="flex items-center gap-4 hover:opacity-80 transition-opacity cursor-pointer">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/20">
                            W
                        </div>
                        <div>
                            <span className="font-bold text-xl text-white tracking-tight block">WebGuide</span>
                            <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-400">Publisher</span>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto">
                    {NAV_ITEMS.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={`flex items-center gap-4 px-4 py-3.5 rounded-xl text-sm font-medium transition-all duration-200 group relative ${isActive
                                        ? "bg-indigo-500/15 text-white shadow-inner border border-indigo-500/20"
                                        : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                                    }`}
                            >
                                {isActive && (
                                    <div className="absolute left-0 w-1.5 h-6 bg-indigo-500 rounded-r-full shadow-[0_0_10px_rgba(99,102,241,0.8)]"></div>
                                )}
                                <span className={`text-lg transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`}>
                                    {item.icon}
                                </span>
                                {item.name}
                            </Link>
                        )
                    })}
                </nav>

                <div className="p-6">
                    <div className="glass-panel rounded-2xl p-4 flex items-center justify-between mb-4 hover:border-indigo-500/30 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-slate-700 to-slate-600 flex items-center justify-center border border-white/10 shadow-inner">
                                👤
                            </div>
                            <div className="overflow-hidden">
                                <p className="text-sm font-medium text-white truncate">Publisher</p>
                                <p className="text-xs text-slate-500 truncate">Pro Plan</p>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={() => {
                            localStorage.removeItem('token');
                            router.push('/login');
                        }}
                        className="w-full flex justify-center items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all border border-transparent hover:border-red-500/20"
                    >
                        <span>🚪</span> Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col overflow-hidden relative">
                {/* Background ambient light */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none"></div>

                <header className="h-20 border-b border-white/5 bg-slate-900/40 backdrop-blur-md flex items-center justify-between px-10 z-10 sticky top-0">
                    <div>
                        <h2 className="text-2xl font-bold text-white tracking-tight">
                            {pathname === '/' ? 'Overview' : pathname.replace('/', '').charAt(0).toUpperCase() + pathname.replace('/', '').slice(1)}
                        </h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="flex h-2 w-2 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <span className="text-xs text-slate-400 font-medium tracking-wide">All systems operational</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <button className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors relative">
                            🔔
                            <div className="absolute top-2 right-2.5 w-1.5 h-1.5 rounded-full bg-red-500"></div>
                        </button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto px-10 py-8 z-0">
                    <div className="max-w-6xl mx-auto pb-12">
                        {children}
                    </div>
                </div>
            </main>
        </div>
    );
}
