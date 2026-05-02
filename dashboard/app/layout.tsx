import './globals.css';

export const metadata = {
    title: 'WebGuide Publisher Dashboard',
    description: 'Manage your interactive AI web guides',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className="bg-[#0f172a] text-slate-200 antialiased selection:bg-indigo-500/30">
                {children}
            </body>
        </html>
    )
}
