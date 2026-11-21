// ─── Stage Navigation Bar ───
import React from 'react';
import { useAppState, useAppDispatch, type Stage } from '../state';

const STAGES: { id: Stage; label: string; icon: string }[] = [
  { id: 'site', label: 'Site', icon: '📍' },
  { id: 'building', label: 'Building', icon: '🏗️' },
  { id: 'floor', label: 'Floor', icon: '🏢' },
  { id: 'compliance', label: 'Compliance', icon: '✅' },
  { id: 'report', label: 'Report', icon: '📊' },
];

export function StageBar() {
  const { stage, polygon } = useAppState();
  const dispatch = useAppDispatch();
  const hasPolygon = polygon.length >= 3;

  return (
    <nav
      data-testid="stage-bar"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 bg-neutral-900/90 backdrop-blur-md border border-neutral-700/50 rounded-full px-2 py-1.5 shadow-2xl"
    >
      {STAGES.map((s, i) => {
        const isActive = stage === s.id;
        const isDisabled = s.id !== 'site' && !hasPolygon;
        return (
          <button
            key={s.id}
            data-testid={`stage-${s.id}`}
            disabled={isDisabled}
            onClick={() => dispatch({ type: 'SET_STAGE', stage: s.id })}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200
              ${isActive
                ? 'bg-white text-neutral-900 shadow-lg'
                : isDisabled
                  ? 'text-neutral-600 cursor-not-allowed'
                  : 'text-neutral-300 hover:text-white hover:bg-neutral-800'
              }
            `}
          >
            <span className="text-sm">{s.icon}</span>
            <span className="hidden sm:inline">{s.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
