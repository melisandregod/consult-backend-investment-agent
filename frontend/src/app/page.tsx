'use client';

import { useEffect, useState } from 'react';
import { 
  TrendingUp, TrendingDown, CheckCircle, Clock, 
  Wallet, Activity, Zap, ShoppingBag, Info,
  PieChart as PieIcon, ArrowUpRight, ArrowDownRight,
  AlertCircle, RefreshCw
} from 'lucide-react';
import { 
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
  gain_loss_usd: number;
  gain_loss_pct: number;
  action: string;
  allocation_current_pct: number;
  allocation_target_pct: number;
  allocation_gap_pct: number;
  recommend_usd: number;
  recommend_thb: number;
  rebalance_target_usd: number;
  rebalance_diff_usd: number;
  rebalance_action: 'BUY' | 'SELL';
  rebalance_diff_thb: number;
  is_rebalance_significant: boolean;
}

interface SummaryData {
  total_market_value: number;
  budget_remaining: number;
  exchange_rate: number;
  is_rebalance_month: boolean;
  months_until_rebalance: number;
  analysis: AnalysisItem[];
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

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
        <p className="text-slate-500 font-medium text-sm tracking-tight">Syncing with Market Records...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="p-6 text-center bg-slate-50 min-h-screen flex items-center justify-center">
      <div className="bg-white border border-red-100 p-8 rounded-3xl shadow-xl max-w-xs w-full">
        <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
           <AlertCircle className="text-red-500 w-6 h-6" />
        </div>
        <h2 className="font-black text-slate-800 mb-2">Connection Error</h2>
        <p className="text-xs text-slate-500 font-medium mb-6 leading-relaxed">{error}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="w-full bg-slate-900 text-white py-3 rounded-2xl text-xs font-black hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-3 h-3" />
          Reconnect
        </button>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-20 font-sans">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-md border-b sticky top-0 z-30 px-4 pt-4 shadow-sm">
        <div className="max-w-md mx-auto space-y-4 pb-3">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-900">Wealth System v2</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">DCA + Quarterly Rebalance</p>
            </div>
            <button 
              onClick={() => setShowThb(!showThb)}
              className="bg-slate-100 hover:bg-slate-200 active:scale-95 px-3 py-1.5 rounded-xl text-[10px] font-black text-slate-600 border border-slate-200 transition-all"
            >
              {showThb ? 'CURRENCY: THB' : 'CURRENCY: USD'}
            </button>
          </div>

          {/* Tab Switcher */}
          <div className="flex bg-slate-100/50 p-1 rounded-2xl border border-slate-200/50">
            <button 
              onClick={() => setActiveTab('plan')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all",
                activeTab === 'plan' ? "bg-white text-blue-600 shadow-md ring-1 ring-slate-200/50" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <Zap className={cn("w-3.5 h-3.5", activeTab === 'plan' ? "fill-blue-500/10" : "")} />
              Monthly Plan
            </button>
            <button 
              onClick={() => setActiveTab('portfolio')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all",
                activeTab === 'portfolio' ? "bg-white text-blue-600 shadow-md ring-1 ring-slate-200/50" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <PieIcon className="w-3.5 h-3.5" />
              Allocation
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
  const buyRecommendations = data.analysis.filter(a => a.recommend_usd > 0);
  const nextRebalanceMonth = new Date(0, [2, 5, 8, 11].find(m => m >= new Date().getMonth()) || 2).toLocaleString('en-US', { month: 'long' });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Rebalance Alert / Countdown */}
      {data.is_rebalance_month ? (
        <div className="bg-purple-600 p-5 rounded-3xl shadow-xl shadow-purple-200 text-white relative overflow-hidden">
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <RefreshCw className="w-4 h-4 animate-spin-slow" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">Quarterly Milestone</span>
            </div>
            <h2 className="text-xl font-black mb-1 leading-tight">It's Rebalance Time!</h2>
            <p className="text-[11px] text-purple-100 font-bold opacity-90">
              Reset all assets back to target percentages for maximum long-term growth.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white p-4 rounded-3xl border border-slate-200 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-2xl flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Next Rebalance</p>
              <p className="text-sm font-black text-slate-800">In {data.months_until_rebalance} Month(s)</p>
            </div>
          </div>
          <div className="text-right">
             <span className="bg-slate-100 px-3 py-1 rounded-full text-[10px] font-black text-slate-500 uppercase tracking-tight">
               Scheduled: {nextRebalanceMonth}
             </span>
          </div>
        </div>
      )}

      {/* Rebalance Table (Only in Rebalance Month) */}
      {data.is_rebalance_month && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
             <div className="flex items-center gap-2">
               <RefreshCw className="w-4 h-4 text-purple-600" />
               <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">System Correction Table</h3>
             </div>
             <span className="text-[10px] font-bold text-slate-400 italic">Syncing Port...</span>
          </div>
          <div className="bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="py-4 px-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Asset</th>
                    <th className="py-4 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Target</th>
                    <th className="py-4 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Action</th>
                    <th className="py-4 px-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.analysis.map((asset) => (
                    <tr key={asset.symbol} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center font-black text-[10px] text-slate-600 group-hover:bg-white transition-colors">
                            {asset.symbol.substring(0, 2)}
                          </div>
                          <span className="text-xs font-black text-slate-800">{asset.symbol}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                          {asset.allocation_target_pct}%
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className={cn(
                          "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter",
                          asset.rebalance_action === 'SELL' 
                            ? "bg-purple-50 text-purple-600 ring-1 ring-purple-100" 
                            : "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100"
                        )}>
                          {asset.rebalance_action === 'SELL' ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                          {asset.rebalance_action}
                        </div>
                      </td>
                      <td className="py-4 px-5 text-right">
                        <div className="flex flex-col items-end">
                          <span className={cn(
                            "text-xs font-black",
                            asset.rebalance_action === 'SELL' ? "text-purple-700" : "text-emerald-700"
                          )}>
                            {showThb ? `฿${Math.abs(asset.rebalance_diff_thb).toLocaleString()}` : `$${Math.abs(asset.rebalance_diff_usd).toLocaleString()}`}
                          </span>
                          {asset.is_rebalance_significant && (
                            <span className="text-[7px] font-black bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-sm uppercase tracking-tighter mt-1">
                              🚨 Drift Limit
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Monthly Budget Card */}
      <div className="bg-slate-900 p-6 rounded-3xl shadow-xl relative overflow-hidden group">
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl group-hover:bg-blue-500/30 transition-all duration-700"></div>
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-1">New Capital Injection</p>
              <h3 className="text-3xl font-black text-white tracking-tight">
                {showThb ? `฿${(data.budget_remaining * data.exchange_rate).toLocaleString()}` : `$${data.budget_remaining.toLocaleString()}`}
              </h3>
            </div>
            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md">
              <Wallet className="text-white w-6 h-6" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-6 border-t border-white/10">
             <div>
               <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-1">Portfolio Worth</p>
               <p className="text-sm font-black text-white">
                 {showThb ? `฿${(data.total_market_value * data.exchange_rate).toLocaleString()}` : `$${data.total_market_value.toLocaleString()}`}
               </p>
             </div>
             <div className="text-right">
               <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-1">Asset Count</p>
               <p className="text-sm font-black text-white">{data.analysis.length} Records</p>
             </div>
          </div>
        </div>
      </div>

      {/* Buy List */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-2 px-1">
          <ShoppingBag className="w-4 h-4 text-slate-800" />
          <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">DCA Recommendations</h2>
        </div>
        
        <div className="grid grid-cols-1 gap-3">
          {buyRecommendations.map((asset) => (
            <div key={asset.symbol} className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between hover:border-blue-200 transition-all">
               <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center font-black text-slate-600 text-sm">
                    {asset.symbol.substring(0, 2)}
                  </div>
                  <div>
                    <h4 className="font-black text-slate-900 tracking-tight">{asset.symbol}</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Target: {asset.allocation_target_pct}%</p>
                  </div>
               </div>
               <div className="text-right">
                  <p className="text-xs font-black text-slate-400 mb-0.5 uppercase tracking-tighter">Allocate</p>
                  <p className="text-lg font-black text-blue-600 tracking-tight">
                    {showThb ? `฿${asset.recommend_thb.toLocaleString()}` : `$${asset.recommend_usd.toLocaleString()}`}
                  </p>
               </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PortfolioSummaryView({ data, showThb }: { data: SummaryData, showThb: boolean }) {
  const chartData = data.analysis.map(a => ({ name: a.symbol, value_usd: a.market_value, current: a.allocation_current_pct, target: a.allocation_target_pct }));

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Allocation Wheel */}
      <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 relative group overflow-hidden">
        <div className="absolute inset-0 bg-slate-50/50 opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-8 text-center relative z-10">Current Weight Distribution</h3>
        <div className="h-56 w-full relative z-10">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={75}
                outerRadius={95}
                paddingAngle={4}
                dataKey="value_usd"
                stroke="none"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} className="hover:opacity-80 transition-all cursor-pointer" />
                ))}
              </Pie>
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0].payload;
                    return (
                      <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-xl text-[10px] font-black ring-1 ring-white/10">
                        <p className="text-blue-400 mb-1">{item.name}</p>
                        <p>CURRENT: {item.current}%</p>
                        <p className="text-white/40">TARGET: {item.target}%</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Total Assets</span>
            <span className="text-2xl font-black text-slate-800">{data.analysis.length}</span>
          </div>
        </div>

        {/* Legend Grid */}
        <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 relative z-10">
          {chartData.map((stat, i) => (
            <div key={stat.name} className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full ring-4 ring-slate-50" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <div>
                <p className="text-[10px] font-black text-slate-800 tracking-tight">{stat.name}</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold text-slate-400">{stat.current}%</span>
                  <div className="w-1 h-1 bg-slate-200 rounded-full"></div>
                  <span className="text-[9px] font-bold text-blue-500/60">T: {stat.target}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Asset Gap Analysis */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-2 px-1">
          <Activity className="w-4 h-4 text-slate-800" />
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Performance Matrix</h3>
        </div>
        {data.analysis.map((asset) => (
          <AssetPerformanceRow key={asset.symbol} asset={asset} showThb={showThb} />
        ))}
      </div>
    </div>
  );
}

function AssetPerformanceRow({ asset, showThb }: { asset: AnalysisItem, showThb: boolean }) {
  const isProfit = asset.gain_loss_usd >= 0;
  const gap = asset.allocation_gap_pct;

  return (
    <div className="bg-white p-5 rounded-[30px] border border-slate-200 flex justify-between items-center shadow-sm hover:shadow-md transition-all active:scale-[0.98]">
      <div className="flex items-center gap-4">
        <div className={cn(
          "w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xs",
          asset.type === 'CRYPTO' ? "bg-amber-50 text-amber-600 shadow-inner" : "bg-blue-50 text-blue-600 shadow-inner"
        )}>
          {asset.symbol.substring(0, 2)}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-black text-slate-900">{asset.symbol}</h4>
            {Math.abs(gap) > 2 && (
              <span className={cn(
                "text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-tighter",
                gap > 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
              )}>
                {gap > 0 ? 'Under' : 'Over'}
              </span>
            )}
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
            {asset.qty.toFixed(4)} UNITS
          </p>
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
        <p className="text-[10px] font-black text-slate-800 opacity-30 mt-0.5">
          {showThb ? `฿${asset.market_value_thb.toLocaleString()}` : `$${asset.market_value.toLocaleString()}`}
        </p>
      </div>
    </div>
  );
}
