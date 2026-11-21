// ─── Floating Stage Navigation Bar ───
import React from 'react';
import { useAppState, useAppDispatch, type Stage } from '../state';

const STAGES: { id: Stage; label: string; icon: string; num: string }[] = [
  { id: 'site', label: 'Site', icon: '📍', num: '1' },
  { id: 'building', label: 'Building', icon: '🏗️', num: '2' },
  { id: 'floor', label: 'Floor', icon: '🏢', num: '3' },
  { id: 'compliance', label: 'Compliance', icon: '⚖️', num: '4' },
  { id: 'report', label: 'Report', icon: '📊', num: '5' },
];

export function StageBar() {
  const { stage, polygon } = useAppState();
  const dispatch = useAppDispatch();
  const hasPolygon = polygon.length >= 3;

  return (
    <nav
      data-testid="stage-bar"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 bg-slate-900/85 backdrop-blur-xl border border-slate-700/60 rounded-full px-2 py-1.5 shadow-2xl"
    >
      {STAGES.map((s) => {
        const isActive = stage === s.id;
        const isDisabled = s.id !== 'site' && !hasPolygon;
        return (
          <button
            key={s.id}
            data-testid={`stage-${s.id}`}
            disabled={isDisabled}
            onClick={() => dispatch({ type: 'SET_STAGE', stage: s.id })}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 select-none
              ${isActive
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 font-semibold'
                : isDisabled
                  ? 'text-slate-600 cursor-not-allowed'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }
            `}
          >
            <span className="text-xs">{s.icon}</span>
            <span>{s.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
