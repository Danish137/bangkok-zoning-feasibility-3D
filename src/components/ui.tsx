// ─── Shared UI primitives ───
import React from 'react';
import type { CheckStatus } from '../engine/types';

export function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-400">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Metric({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'good' | 'warn' | 'bad' | 'accent' }) {
  const color = tone === 'good' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : tone === 'bad' ? 'text-rose-300' : tone === 'accent' ? 'text-indigo-200' : 'text-slate-100';
  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 px-2.5 py-1.5 min-w-0">
      <div className="text-[10px] text-slate-400 truncate">{label}</div>
      <div className={`text-[12.5px] font-semibold tabular-nums truncate ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500 truncate">{sub}</div>}
    </div>
  );
}

const STATUS_STYLE: Record<CheckStatus, string> = {
  PASS: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  FAIL: 'bg-rose-500/15 text-rose-300 border-rose-500/50',
  UNVERIFIED: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  INFO: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  'N/A': 'bg-slate-700/30 text-slate-400 border-slate-600/40',
};

export function StatusPill({ status }: { status: CheckStatus }) {
  return (
    <span data-status={status} className={`inline-flex shrink-0 items-center rounded border px-1.5 py-[1px] text-[9.5px] font-bold tracking-wide ${STATUS_STYLE[status]}`}>
      {status}
    </span>
  );
}

export function Button({
  children, onClick, variant = 'secondary', disabled, title, testId, className = '',
}: {
  children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean; title?: string; testId?: string; className?: string;
}) {
  const v = {
    primary: 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500',
    secondary: 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-600/60',
    ghost: 'bg-transparent hover:bg-slate-800 text-slate-300 border-transparent',
    danger: 'bg-rose-600/80 hover:bg-rose-500 text-white border-rose-500/60',
  }[variant];
  return (
    <button
      type="button"
      data-testid={testId}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${v} ${className}`}
    >
      {children}
    </button>
  );
}

export function Toggle({ label, checked, onChange, swatch, testId, hint }: { label: string; checked: boolean; onChange: () => void; swatch?: string; testId?: string; hint?: string }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onChange}
      title={hint}
      className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[11.5px] transition-colors ${checked ? 'border-slate-600 bg-slate-800/80 text-slate-100' : 'border-slate-700/40 bg-slate-800/20 text-slate-400 hover:text-slate-200'}`}
    >
      <span className="flex items-center gap-2">
        {swatch && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: swatch, opacity: checked ? 1 : 0.35 }} />}
        {label}
      </span>
      <span className={`h-3.5 w-6 rounded-full p-[2px] transition-colors ${checked ? 'bg-indigo-500' : 'bg-slate-600'}`}>
        <span className={`block h-2.5 w-2.5 rounded-full bg-white transition-transform ${checked ? 'translate-x-2.5' : ''}`} />
      </span>
    </button>
  );
}

export function Callout({ tone, title, children, testId }: { tone: 'info' | 'warn' | 'bad' | 'good'; title?: string; children: React.ReactNode; testId?: string }) {
  const c = {
    info: 'border-sky-500/30 bg-sky-500/10 text-sky-100',
    warn: 'border-amber-500/40 bg-amber-500/10 text-amber-100',
    bad: 'border-rose-500/50 bg-rose-500/10 text-rose-100',
    good: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100',
  }[tone];
  return (
    <div data-testid={testId} className={`rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${c}`}>
      {title && <div className="mb-0.5 font-semibold">{title}</div>}
      {children}
    </div>
  );
}

export const fmtNum = (v: number, d = 0) => (Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
