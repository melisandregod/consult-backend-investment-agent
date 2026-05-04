'use client';

import { useEffect, useState } from 'react';
import { 
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Clock, 
  ChevronRight, Wallet, Activity, Target, Zap, ShoppingBag, Info,
  PieChart as PieIcon, LayoutList, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { 
  LineChart, Line, ResponsiveContainer, YAxis, PieChart, Pie, Cell, Tooltip
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface AllocationStat {
  name: string;
  current: number;
  target: number;
  value_usd: number;
}

interface AnalysisItem {
  symbol: string;
  type: string;
  price: number;
  price_thb: number;
  qty: number;
  market_value: number;
  market_value_thb: number;
  cost_usd: number;
  cost_thb: number;
  gain_loss_usd: number;
  gain_loss_thb: number;
  gain_loss_pct: number;
  score: number;
  action: string;
  reasons: string[];
  allocation_current_pct: number;
  allocation_target_pct: number;
  allocation_gap_pct: number;
  rsi: number;
  ema200: number;
  sparkline: number[];
  recommend_usd?: number;
  recommend_thb?: number;
  is_budget_limited?: boolean;
}

interface SummaryData {
  total_market_value: number;
  total_market_value_thb: number;
  total_cost_usd: number;
  total_cost_thb: number;
  total_pl_usd: number;
  total_pl_thb: number;
  total_pl_pct: number;
  budget_remaining: number;
  budget_remaining_thb: number;
  budget_status: 'AVAILABLE' | 'EXHAUSTED' | 'OVERSPENT';
  exchange_rate: number;
  fear_greed_crypto: number;
  fear_greed_us: number;
  allocation_stats: AllocationStat[];
  analysis: AnalysisItem[];
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function Home() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showThb, setShowThb] = useState(true);
  const [activeTab, setActiveTab] = useState<'plan' | 'portfolio'>('plan');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('http://localhost:3003/analyze');
        if (!res.ok) throw new Error('Failed to fetch data');
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <div className="flex flex-col items-center gap-4">
        <Activity className="w-8 h-8 text-blue-500 animate-pulse" />
        <p className="text-slate-500 font-medium">Scanning market opportunities...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="p-6 text-center bg-slate-50 min-h-screen">
      <div className="bg-red-50 border border-red-200 p-4 rounded-xl inline-block">
        <p className="text-red-600">Error: {error}</p>
        <button onClick={() => window.location.reload()} className="mt-2 text-sm font-semibold text-red-700 underline">Retry</button>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-30 px-4 pt-4 shadow-sm">
        <div className="max-w-md mx-auto space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-800">Investment AI</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">USD/THB: {data?.exchange_rate}</p>
            </div>
            <button 
              onClick={() => setShowThb(!showThb)}
              className="bg-slate-100 hover:bg-slate-200 active:bg-slate-300 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 border border-slate-200 transition-colors"
            >
              {showThb ? 'Show USD' : 'Show THB'}
            </button>
          </div>

          {/* Tab Switcher */}
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setActiveTab('plan')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all",
                activeTab === 'plan' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Zap className={cn("w-3.5 h-3.5", activeTab === 'plan' ? "fill-blue-500/10" : "")} />
              Action Plan
            </button>
            <button 
              onClick={() => setActiveTab('portfolio')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all",
                activeTab === 'portfolio' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <PieIcon className="w-3.5 h-3.5" />
              Portfolio
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4">
        {activeTab === 'plan' ? (
          <ActionPlanView data={data!} showThb={showThb} />
        ) : (
          <PortfolioSummaryView data={data!} showThb={showThb} />
        )}
      </div>
    </main>
  );
}

function ActionPlanView({ data, showThb }: { data: SummaryData, showThb: boolean }) {
  const actionableAssets = data.analysis.filter(a => a.score >= 40);
  const holdingAssets = data.analysis.filter(a => a.score < 40);
  const isBudgetExhausted = data.budget_status !== 'AVAILABLE';

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Task Summary Banner */}
      <div className={cn(
        "p-4 rounded-2xl border-2 flex items-center gap-4",
        isBudgetExhausted ? "bg-slate-100 border-slate-200" : (actionableAssets.length > 0 ? "bg-blue-50 border-blue-100" : "bg-emerald-50 border-emerald-100")
      )}>
        {isBudgetExhausted ? (
          <Clock className="w-6 h-6 text-slate-400" />
        ) : (actionableAssets.length > 0 ? (
          <ShoppingBag className="w-6 h-6 text-blue-500" />
        ) : (
          <CheckCircle className="w-6 h-6 text-emerald-500" />
        ))}
        <div>
          <h2 className="font-black text-sm uppercase tracking-tight">
            {isBudgetExhausted ? "Monthly Goal Reached" : (actionableAssets.length > 0 ? `Action: Buy ${actionableAssets.length} Assets` : "Task: Just Keep Holding")}
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            {isBudgetExhausted ? "No more budget for this month. Wait for next refill." : (actionableAssets.length > 0 ? "Strategic opportunities identified based on your plan." : "Market is balanced. No immediate action needed.")}
          </p>
        </div>
      </div>

      {/* Budget Card */}
      <div className={cn(
        "p-5 rounded-2xl shadow-lg relative overflow-hidden transition-all",
        isBudgetExhausted ? "bg-slate-200 text-slate-600 shadow-none grayscale" : "bg-gradient-to-br from-slate-800 to-slate-900 text-white"
      )}>
        <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2 opacity-80">
            <Wallet className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              {isBudgetExhausted ? "Monthly Budget Used" : "Available to Buy"}
            </span>
          </div>
          <p className="text-3xl font-black tracking-tight">
            {showThb ? `฿${data.budget_remaining_thb?.toLocaleString()}` : `$${data.budget_remaining?.toLocaleString()}`}
          </p>
          <div className="mt-4 pt-4 border-t border-current/20 flex justify-between items-center text-sm">
            <span className="opacity-80 font-medium">Net Worth</span>
            <span className="font-bold">
              {showThb ? `฿${data.total_market_value_thb?.toLocaleString()}` : `$${data.total_market_value?.toLocaleString()}`}
            </span>
          </div>
        </div>
      </div>

      {/* FNG Row */}
      <div className="grid grid-cols-2 gap-3">
        <FngIndicator label="Crypto Market" value={data.fear_greed_crypto} />
        <FngIndicator label="Stock Market" value={data.fear_greed_us} />
      </div>

      {/* Actionable List */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 pl-1 mb-2">
          <Zap className="w-5 h-5 text-amber-500 fill-amber-500/20" />
          <h2 className="text-lg font-black text-slate-800">Buy Recommendations</h2>
        </div>
        
        {actionableAssets.length === 0 ? (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 text-center shadow-sm">
            <Activity className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <h3 className="font-bold text-slate-400 mb-1 italic">No clear signals today...</h3>
          </div>
        ) : (
          actionableAssets.map((asset) => (
            <ActionCard key={asset.symbol} asset={asset} showThb={showThb} isBudgetExhausted={isBudgetExhausted} />
          ))
        )}
      </div>

      {/* Holding List */}
      {holdingAssets.length > 0 && (
        <div className="space-y-3 pt-6">
          <div className="flex items-center gap-2 pl-1 mb-2 opacity-60">
            <Info className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-bold text-slate-600 uppercase tracking-widest">Holding Assets ({holdingAssets.length})</h2>
          </div>
          {holdingAssets.map((asset) => (
            <HoldCard key={asset.symbol} asset={asset} showThb={showThb} />
          ))}
        </div>
      )}
    </div>
  );
}

function PortfolioSummaryView({ data, showThb }: { data: SummaryData, showThb: boolean }) {
  const totalPL = showThb ? data.total_pl_thb : data.total_pl_usd;
  const isProfit = totalPL >= 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Overall Performance Card */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 text-center">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Total Profit / Loss</p>
        <div className={cn(
          "inline-flex items-center gap-2 px-4 py-2 rounded-2xl mb-2",
          isProfit ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
        )}>
          {isProfit ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
          <span className="text-2xl font-black">
            {isProfit ? '+' : ''}{data.total_pl_pct}%
          </span>
        </div>
        <p className={cn("text-lg font-bold", isProfit ? "text-emerald-500" : "text-red-500")}>
          {isProfit ? '+' : ''}{showThb ? `฿${totalPL.toLocaleString()}` : `$${totalPL.toLocaleString()}`}
        </p>
        
        <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-slate-50">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Total Invested</p>
            <p className="text-sm font-bold text-slate-800">
              {showThb ? `฿${data.total_cost_thb.toLocaleString()}` : `$${data.total_cost_usd.toLocaleString()}`}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Market Value</p>
            <p className="text-sm font-bold text-slate-800">
              {showThb ? `฿${data.total_market_value_thb.toLocaleString()}` : `$${data.total_market_value.toLocaleString()}`}
            </p>
          </div>
        </div>
      </div>

      {/* Allocation Chart */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-6 text-center">Asset Allocation</h3>
        <div className="h-48 w-full relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data.allocation_stats}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value_usd"
              >
                {data.allocation_stats.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0].payload;
                    return (
                      <div className="bg-white p-2 border border-slate-100 rounded-lg shadow-md text-[10px] font-bold">
                        <p>{item.name}: {item.current}%</p>
                        <p className="text-slate-400">Target: {item.target}%</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Diversity</span>
            <span className="text-lg font-black text-slate-800">{data.allocation_stats.length} Types</span>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          {data.allocation_stats.map((stat, i) => (
            <div key={stat.name} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <div>
                <p className="text-[10px] font-bold text-slate-800">{stat.name}</p>
                <p className="text-[10px] text-slate-400">{stat.current}% (Target: {stat.target}%)</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Asset Performance List */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest pl-1">Performance Details</h3>
        {data.analysis.map((asset) => (
          <AssetPerformanceRow key={asset.symbol} asset={asset} showThb={showThb} />
        ))}
      </div>
    </div>
  );
}

function AssetPerformanceRow({ asset, showThb }: { asset: AnalysisItem, showThb: boolean }) {
  const isProfit = asset.gain_loss_usd >= 0;
  return (
    <div className="bg-white p-4 rounded-2xl border border-slate-100 flex justify-between items-center shadow-sm">
      <div className="flex items-center gap-3">
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm",
          asset.type === 'CRYPTO' ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
        )}>
          {asset.symbol.substring(0, 2)}
        </div>
        <div>
          <h4 className="font-black text-slate-800">{asset.symbol}</h4>
          <p className="text-[10px] font-bold text-slate-400 uppercase">Avg: {showThb ? `฿${(asset.cost_thb / asset.qty).toLocaleString()}` : `$${(asset.cost_usd / asset.qty).toLocaleString()}`}</p>
        </div>
      </div>
      <div className="text-right">
        <div className={cn(
          "flex items-center justify-end gap-1 text-sm font-black",
          isProfit ? "text-emerald-500" : "text-red-500"
        )}>
          {isProfit ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
          {isProfit ? '+' : ''}{asset.gain_loss_pct}%
        </div>
        <p className="text-[10px] font-bold text-slate-400 uppercase">
          {isProfit ? '+' : ''}{showThb ? `฿${asset.gain_loss_thb.toLocaleString()}` : `$${asset.gain_loss_usd.toLocaleString()}`}
        </p>
      </div>
    </div>
  );
}

function FngIndicator({ label, value }: { label: string, value: number }) {
  const isFear = value < 30;
  const isGreed = value > 70;
  return (
    <div className={cn(
      "p-3 rounded-xl border flex flex-col justify-center",
      isFear ? "bg-red-50 border-red-100" : isGreed ? "bg-emerald-50 border-emerald-100" : "bg-amber-50 border-amber-100"
    )}>
      <span className="text-[10px] font-bold text-slate-500 uppercase mb-1">{label}</span>
      <div className="flex items-center justify-between">
        <span className={cn(
          "text-lg font-black",
          isFear ? "text-red-600" : isGreed ? "text-emerald-600" : "text-amber-600"
        )}>{value}</span>
        <span className="text-[10px] font-bold text-slate-400 uppercase">
          {isFear ? 'Fear' : isGreed ? 'Greed' : 'Neutral'}
        </span>
      </div>
    </div>
  );
}

function getThaiAction(action: string) {
  if (action.includes('STRONG_BUY')) return 'ซื้อด่วน 🚀';
  if (action.includes('BUY')) return 'แนะนำให้ซื้อ ✅';
  if (action.includes('ACCUMULATE')) return 'ทยอยสะสม ⚠️';
  if (action.includes('TRIM')) return 'ขายทำกำไร 💰';
  if (action.includes('REDUCE')) return 'ลดสัดส่วน ⚠️';
  return 'ถือรอจังหวะ';
}

function getThaiSummary(asset: AnalysisItem) {
  if (asset.action.includes('TRIM')) return `สัดส่วนในพอร์ตเยอะเกินเป้า และราคาเริ่มตึงตัว ควรขายทำกำไรออกมาบ้าง`;
  if (asset.action.includes('REDUCE')) return `ราคาขึ้นมาสูงเกินไปและพอร์ตเริ่มหนักตัวนี้เกินไป แนะนำให้ลดสัดส่วนลง`;
  if (asset.action.includes('STRONG_BUY')) return `ราคาลงมาถูกมากและพอร์ตคุณยังขาดตัวนี้อยู่ เป็นจังหวะเข้าซื้อที่ดีที่สุด`;
  if (asset.action.includes('BUY')) return `ราคาน่าสนใจและยังเติมพอร์ตได้อีก แนะนำให้ทยอยซื้อตามแผน`;
  if (asset.action.includes('ACCUMULATE')) return `ราคาเริ่มพักฐานเข้าใกล้จุดที่คุ้มค่า แนะนำให้ค่อยๆ เก็บสะสม`;
  
  const isOverAlloc = asset.allocation_gap_pct < -5;
  const isOverbought = asset.rsi > 70;

  if (isOverAlloc) return `พอร์ตมีตัวนี้เยอะเกินเป้าหมายแล้ว ควรหยุดซื้อเพิ่มเพื่อกระจายความเสี่ยง`;
  if (isOverbought) return `ราคาขึ้นมาแรงเกินไปในระยะสั้น เสี่ยงโดนเทขาย แนะนำให้ถือรอดูสถานการณ์`;
  return `ราคายังไม่เข้าจุดที่ได้เปรียบ หรือมีสัดส่วนที่เหมาะสมแล้ว แนะนำให้ถือรอจังหวะถัดไป`;
}

function getStatusIcon(action: string) {
  if (action.includes('STRONG_BUY')) return <ShoppingBag className="w-4 h-4" />;
  if (action.includes('BUY')) return <CheckCircle className="w-4 h-4" />;
  if (action.includes('ACCUMULATE')) return <Clock className="w-4 h-4" />;
  if (action.includes('TRIM')) return <TrendingUp className="w-4 h-4" />;
  if (action.includes('REDUCE')) return <AlertTriangle className="w-4 h-4" />;
  return <Search className="w-4 h-4" />;
}

function ActionCard({ asset, showThb, isBudgetExhausted }: { asset: AnalysisItem, showThb: boolean, isBudgetExhausted: boolean }) {
  const isStrongBuy = asset.action.includes('STRONG_BUY');
  const isTrim = asset.action.includes('TRIM');
  const isReduce = asset.action.includes('REDUCE');
  const isAccumulate = asset.action.includes('ACCUMULATE');
  const isActionable = !isTrim && !isReduce;

  const chartData = asset.sparkline.map((val, idx) => ({ val, idx }));
  const recAmount = showThb ? asset.recommend_thb : asset.recommend_usd;
  const recCurrency = showThb ? '฿' : '$';
  
  // Allocation progress
  const progress = Math.min(100, (asset.allocation_current_pct / asset.allocation_target_pct) * 100);

  return (
    <div className={cn(
      "bg-white rounded-3xl border-2 overflow-hidden shadow-lg relative transition-all hover:scale-[1.01]",
      isBudgetExhausted ? "border-slate-200 opacity-95" : 
      isStrongBuy ? "border-emerald-500 shadow-emerald-500/10" : 
      isTrim ? "border-purple-500 shadow-purple-500/10" :
      isReduce ? "border-orange-400 shadow-orange-400/10" :
      "border-amber-400 shadow-amber-400/10"
    )}>
      {/* Badge with Icon */}
      <div className={cn(
        "absolute top-0 right-0 px-4 py-1.5 rounded-bl-2xl font-black text-[11px] uppercase tracking-tighter text-white flex items-center gap-1.5 z-10",
        isBudgetExhausted ? "bg-slate-500" : 
        isStrongBuy ? "bg-emerald-500" : 
        isTrim ? "bg-purple-600" :
        isReduce ? "bg-orange-500" :
        "bg-amber-500"
      )}>
        {getStatusIcon(asset.action)}
        {isBudgetExhausted ? "WATCHLIST" : getThaiAction(asset.action)}
      </div>

      <div className="p-6">
        <div className="flex justify-between items-start mb-5">
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner",
              isBudgetExhausted ? "bg-slate-100 text-slate-400" : 
              isStrongBuy ? "bg-emerald-100 text-emerald-600" : 
              isTrim ? "bg-purple-100 text-purple-600" :
              isReduce ? "bg-orange-100 text-orange-600" :
              "bg-amber-100 text-amber-600"
            )}>
              {asset.symbol.substring(0, 2)}
            </div>
            <div>
              <h3 className="font-black text-2xl text-slate-900 tracking-tight">{asset.symbol}</h3>
              <p className="text-sm font-bold text-slate-500">
                {showThb ? `฿${asset.price_thb.toLocaleString()}` : `$${asset.price.toLocaleString()}`}
              </p>
            </div>
          </div>
          <div className="text-right pt-1">
             <span className="px-2 py-1 rounded-lg bg-slate-100 text-[10px] font-black text-slate-500 uppercase">
                Score: {asset.score}
             </span>
          </div>
        </div>

        {/* Allocation Status Bar */}
        <div className="mb-5 space-y-1.5">
          <div className="flex justify-between items-end">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Allocation สัดส่วนพอร์ต</span>
            <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">
              {asset.allocation_current_pct}% / {asset.allocation_target_pct}%
            </span>
          </div>
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
            <div 
              className={cn(
                "h-full transition-all duration-1000",
                progress >= 100 ? "bg-emerald-500" : "bg-blue-500"
              )} 
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Thai Summary Box */}
        <div className={cn(
          "mb-5 rounded-2xl p-4 border-l-4 shadow-sm",
          isStrongBuy ? "bg-emerald-50 border-emerald-500 text-emerald-900" :
          isTrim ? "bg-purple-50 border-purple-500 text-purple-900" :
          isReduce ? "bg-orange-50 border-orange-500 text-orange-900" :
          isAccumulate ? "bg-blue-50 border-blue-400 text-blue-900" :
          "bg-slate-50 border-slate-300 text-slate-800"
        )}>
           <p className="text-sm font-black leading-relaxed">
             {getThaiSummary(asset)}
           </p>
        </div>

        {/* Suggested Amount Box */}
        {isActionable && recAmount && recAmount > 0 ? (
          <div className={cn(
            "mb-5 rounded-2xl p-4 shadow-md flex justify-between items-center text-white animate-in zoom-in duration-300",
            isBudgetExhausted ? "bg-slate-700 shadow-slate-200" : "bg-blue-600 shadow-blue-200"
          )}>
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-80">
                {isBudgetExhausted ? "เป้าหมายการซื้อ (งบหมดแล้ว)" : "ควรซื้อเพิ่มประมาณ"}
              </span>
              <span className="text-xl font-black tracking-tight">{recCurrency}{recAmount.toLocaleString()}</span>
            </div>
            <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm">
              <ShoppingBag className="w-5 h-5 text-white" />
            </div>
          </div>
        ) : null}

        {/* Reasons Grid */}
        <div className="grid grid-cols-1 gap-2 mb-4">
          {asset.reasons.map((reason, i) => (
            <div key={i} className="flex gap-2.5 items-center bg-slate-50/50 p-2 rounded-xl border border-slate-100/50">
              <span className="flex-shrink-0 text-xs">{reason.includes('✅') ? '🟢' : reason.includes('🚨') ? '🔴' : '🟡'}</span>
              <span className="text-[11px] font-bold text-slate-600">{reason.replace(/[✅⚠️❌🚨🚀🔥]/g, '').trim()}</span>
            </div>
          ))}
        </div>

        {/* Sparkline Visual */}
        <div className="h-10 w-full opacity-60">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <YAxis hide domain={['dataMin', 'dataMax']} />
              <Line 
                type="monotone" 
                dataKey="val" 
                stroke={isBudgetExhausted ? "#94a3b8" : (isStrongBuy ? "#10b981" : isTrim ? "#9333ea" : isReduce ? "#f97316" : "#fbbf24")} 
                strokeWidth={3} 
                dot={false} 
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function HoldCard({ asset, showThb }: { asset: AnalysisItem, showThb: boolean }) {
  const isOverAlloc = asset.allocation_gap_pct < 0;
  const progress = Math.min(100, (asset.allocation_current_pct / asset.allocation_target_pct) * 100);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-all active:scale-95 group">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center font-black text-slate-400 text-sm group-hover:bg-slate-100 transition-colors">
            {asset.symbol.substring(0, 2)}
          </div>
          <div>
            <h3 className="font-black text-slate-900 text-md tracking-tight">{asset.symbol}</h3>
            <p className="text-[10px] font-bold text-slate-500 leading-tight">{asset.allocation_current_pct}% ในพอร์ต</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-md font-black text-slate-900 tracking-tight">
            {showThb ? `฿${asset.price_thb.toLocaleString()}` : `$${asset.price.toLocaleString()}`}
          </p>
          <div className={cn(
            "inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider mt-1",
            isOverAlloc ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-400"
          )}>
            {isOverAlloc ? 'OVER-LIMIT' : 'OPTIMAL'}
          </div>
        </div>
      </div>
      
      {/* Mini Progress Bar for HoldCard */}
      <div className="space-y-1">
        <div className="h-1 w-full bg-slate-50 rounded-full overflow-hidden">
          <div 
            className={cn("h-full", progress >= 100 ? "bg-emerald-400" : "bg-slate-300")} 
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-[10px] font-bold text-slate-400 line-clamp-1">{getThaiSummary(asset)}</p>
      </div>
    </div>
  );
}
