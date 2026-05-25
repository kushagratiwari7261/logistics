import re

with open('d:/noida-main/src/components/AttendanceStats.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

if "import './AttendanceStats.css'" not in content:
    content = content.replace("import { \n  BarChart", "import './AttendanceStats.css';\nimport { \n  BarChart")

replacements = [
    # Loading
    (r'className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white"', r'className="admin-loading-screen"'),
    (r'className="w-12 h-12 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin mb-4"', r'className="admin-spinner"'),
    (r'className="text-slate-400 text-sm"', r'className="admin-loading-text"'),

    # Main container
    (r'className="min-h-screen bg-slate-950 text-white font-sans flex flex-col relative overflow-x-hidden p-6"', r'className="stats-container"'),
    (r'className="absolute top-\[-20%\] left-\[-20%\] w-\[60%\] h-\[60%\] bg-indigo-900/10 rounded-full blur-\[140px\] pointer-events-none"', r'className="stats-glow-indigo"'),
    (r'className="absolute bottom-\[-20%\] right-\[-20%\] w-\[60%\] h-\[60%\] bg-emerald-950/10 rounded-full blur-\[140px\] pointer-events-none"', r'className="stats-glow-emerald"'),
    (r'className="max-w-7xl w-full mx-auto flex flex-col gap-6 z-10"', r'className="stats-main"'),

    # Header
    (r'className="flex items-center justify-between pb-4 border-b border-slate-900"', r'className="stats-header"'),
    (r'className="flex items-center gap-2 px-3 py-1\.5 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800 transition duration-300 text-sm font-medium"', r'className="stats-btn-back"'),
    (r'className="w-4 h-4"', r''),
    (r'className="text-right"', r''),
    (r'className="text-xl font-black bg-gradient-to-r from-white via-slate-300 to-slate-400 bg-clip-text text-transparent"', r'className="stats-title"'),
    (r'className="text-xs text-slate-500"', r'className="stats-subtitle"'),

    # Stats Grid
    (r'className="grid grid-cols-1 md:grid-cols-4 gap-4"', r'className="stats-grid"'),
    (r'className="rounded-2xl border border-slate-900 bg-slate-900/30 p-5 backdrop-blur-md"', r'className="stats-card"'),
    (r'className="flex justify-between items-start text-slate-500"', r'className="stats-card-header"'),
    (r'className="text-xs font-semibold uppercase tracking-wider"', r'className="stats-card-label"'),
    (r'className="w-4 h-4 text-emerald-400"', r'style={{ color: "var(--success)" }}'),
    (r'className="text-3xl font-black mt-2 text-emerald-400"', r'className="stats-card-value" style={{ color: "var(--success)" }}'),
    (r'className="text-\[10px\] text-slate-500 mt-1"', r'className="stats-card-hint"'),
    
    (r'className="w-4 h-4 text-indigo-400"', r'style={{ color: "var(--brand-primary)" }}'),
    (r'className="text-3xl font-black mt-2 text-white"', r'className="stats-card-value"'),
    
    (r'className="w-4 h-4 text-amber-500"', r'style={{ color: "var(--warning)" }}'),
    (r'className="text-3xl font-black mt-2 text-amber-400"', r'className="stats-card-value" style={{ color: "var(--warning)" }}'),
    
    (r'className="text-3xl font-black mt-2 text-indigo-400"', r'className="stats-card-value" style={{ color: "var(--brand-primary)" }}'),

    # Toolbar
    (r'className="flex bg-slate-900/40 border border-slate-900 rounded-xl p-1 w-fit self-start"', r'className="stats-toolbar"'),
    (r"className={`px-4 py-1\.5 rounded-lg text-xs font-bold transition duration-300 \${\s*\n\s*timeframe === 'daily' \? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'\s*\n\s*`}", r"className={`stats-tab ${timeframe === 'daily' ? 'active' : 'inactive'}`}"),
    (r"className={`px-4 py-1\.5 rounded-lg text-xs font-bold transition duration-300 \${\s*\n\s*timeframe === 'monthly' \? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'\s*\n\s*`}", r"className={`stats-tab ${timeframe === 'monthly' ? 'active' : 'inactive'}`}"),
    (r"className={`px-4 py-1\.5 rounded-lg text-xs font-bold transition duration-300 \${\s*\n\s*timeframe === 'yearly' \? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'\s*\n\s*`}", r"className={`stats-tab ${timeframe === 'yearly' ? 'active' : 'inactive'}`}"),

    # Chart Area
    (r'className="grid grid-cols-1 lg:grid-cols-3 gap-6"', r'className="stats-chart-grid"'),
    (r'className="lg:col-span-2 rounded-3xl border border-slate-900 bg-slate-900/20 p-6 backdrop-blur-md"', r'className="stats-chart-main"'),
    (r'className="text-base font-bold mb-6 text-slate-200 flex items-center gap-2"', r'className="stats-chart-title"'),
    (r'className="w-5 h-5 text-indigo-400"', r'style={{ color: "var(--brand-primary)" }}'),
    (r'className="h-\[360px\] w-full"', r'className="stats-chart-container"'),
    
    # Pie Chart
    (r'className="rounded-3xl border border-slate-900 bg-slate-900/20 p-6 backdrop-blur-md flex flex-col gap-6"', r'className="stats-chart-side"'),
    (r'className="text-base font-bold text-slate-200 pb-3 border-b border-slate-900"', r'className="stats-chart-title" style={{ marginBottom: 0 }}'),
    (r'className="h-\[220px\] w-full flex items-center justify-center"', r'className="stats-pie-container"'),
    (r'className="flex flex-col gap-3\.5"', r'className="stats-pie-legend"'),
    (r'className="flex items-center justify-between text-xs font-semibold"', r'className="stats-legend-item"'),
    (r'className="flex items-center gap-2"', r'className="stats-legend-left"'),
    (r'className="w-3 h-3 rounded-md"', r'className="stats-legend-dot"'),
    (r'className="text-slate-400"', r'className="stats-legend-name"'),
    (r'className="font-mono text-slate-200"', r'className="stats-legend-value"'),
]

for pattern, repl in replacements:
    content = re.sub(pattern, repl, content, flags=re.MULTILINE)

with open('d:/noida-main/src/components/AttendanceStats.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Replaced AttendanceStats.jsx classes")
