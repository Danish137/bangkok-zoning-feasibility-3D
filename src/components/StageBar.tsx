// ─── Stage navigation ───
import React from 'react';
import { useAppDispatch, useAppState, type Stage } from '../state';

export const STAGES: { id: Stage; label: string }[] = [
  { id: 'site', label: 'Site' },
  { id: 'building', label: 'Building' },
  { id: 'floor', label: 'Floor' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'report', label: 'Report' },
];

export function StageBar() {
  const s = useAppState();
  const dispatch = useAppDispatch();
  const ready = !!s.result?.designA && !s.drawing.active;
  return (
    <nav data-testid="stage-bar" className="fixed left-1/2 top-3 z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-slate-700/60 bg-slate-900/90 p-1 shadow-2xl backdrop-blur-xl max-[900px]:left-3 max-[900px]:translate-x-0">
      {STAGES.map((st, i) => {
        const active = s.stage === st.id;
        const disabled = st.id !== 'site' && !ready;
        return (
          <button
            key={st.id}
            data-testid={`stage-${st.id}`}
            disabled={disabled}
            onClick={() => dispatch({ type: 'SET_STAGE', stage: st.id })}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-medium transition-colors ${active ? 'bg-indigo-600 text-white shadow shadow-indigo-900/50' : disabled ? 'cursor-not-allowed text-slate-600' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
          >
            <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9.5px] ${active ? 'bg-white/20' : 'bg-slate-700/70'}`}>{i + 1}</span>
            {st.label}
          </button>
        );
      })}
    </nav>
  );
}
