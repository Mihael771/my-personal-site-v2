import { useEffect, useRef, useState } from 'react';
import type {
  BodyView,
  DateSnapshotStats,
  MuscleId,
} from '../types/fitness';
import { MUSCLE_MAP, formatGrams } from '../utils/fitnessMath';

interface HumanAnatomySvgProps {
  view: BodyView;
  stats: DateSnapshotStats;
  interactive?: boolean;
  onToggleMuscle?: (muscleId: MuscleId) => void;
  figureLabel: string;
  testIdPrefix: string;
}

interface TooltipState {
  muscleId: MuscleId;
  xPercent: number;
  yPercent: number;
}

const TOOLTIP_ANCHORS: Record<BodyView, Partial<Record<MuscleId, { x: number; y: number }>>> = {
  front: {
    shoulders: { x: 26, y: 22 },
    chest: { x: 50, y: 26 },
    biceps: { x: 22, y: 34 },
    abs: { x: 50, y: 40 },
    legs: { x: 38, y: 66 },
  },
  back: {
    shoulders: { x: 26, y: 22 },
    back: { x: 50, y: 31 },
    triceps: { x: 22, y: 34 },
    legs: { x: 62, y: 66 },
  },
};

export function HumanAnatomySvg({
  view,
  stats,
  interactive = false,
  onToggleMuscle,
  figureLabel,
  testIdPrefix,
}: HumanAnatomySvgProps) {
  const [hoveredMuscle, setHoveredMuscle] = useState<TooltipState | null>(null);
  const [hasFlipped, setHasFlipped] = useState(false);
  const prevViewRef = useRef<BodyView>(view);
  const isFatigued = stats.recovery.isFatigued;

  useEffect(() => {
    if (prevViewRef.current !== view) {
      prevViewRef.current = view;
      setHasFlipped(true);
      setHoveredMuscle(null);
    }
  }, [view]);

  function getMuscleColors(muscleId: MuscleId) {
    const mStats = stats.byMuscle[muscleId];
    const trained = mStats.trainedOnDate;
    const growthRatio = Math.min(1, mStats.totalGrams / 200);

    if (isFatigued) {
      if (trained) {
        return {
          fill: 'rgba(220, 38, 38, 0.80)',
          stroke: '#fca5a5',
          strokeWidth: 1.8,
        };
      }
      return {
        fill: `rgba(153, 27, 27, ${0.28 + growthRatio * 0.16})`,
        stroke: 'rgba(248, 113, 113, 0.5)',
        strokeWidth: 1.2,
      };
    }

    if (trained) {
      const accentOpacity = stats.recovery.percentage === 100 ? 0.9 : 0.65;
      return {
        fill: `color-mix(in srgb, var(--accent) ${Math.round(accentOpacity * 100)}%, #0f172a)`,
        stroke: 'var(--accent-text)',
        strokeWidth: 1.8,
      };
    }

    const baseMix = Math.round(growthRatio * 24);
    return {
      fill: `color-mix(in srgb, var(--accent) ${baseMix}%, rgba(30, 41, 59, ${0.78 + growthRatio * 0.18}))`,
      stroke: growthRatio > 0.25 ? 'rgba(148, 163, 184, 0.45)' : 'rgba(148, 163, 184, 0.28)',
      strokeWidth: 1.15,
    };
  }

  function handleShowTooltip(muscleId: MuscleId) {
    const anchor = TOOLTIP_ANCHORS[view][muscleId] ?? { x: 50, y: 35 };
    setHoveredMuscle({
      muscleId,
      xPercent: anchor.x,
      yPercent: anchor.y,
    });
  }

  function handleMuscleInteraction(muscleId: MuscleId) {
    if (interactive && onToggleMuscle) {
      onToggleMuscle(muscleId);
    }
  }

  function renderMuscleProps(muscleId: MuscleId) {
    const def = MUSCLE_MAP[muscleId];
    const mStats = stats.byMuscle[muscleId];
    const colors = getMuscleColors(muscleId);
    const isHovered = hoveredMuscle?.muscleId === muscleId;

    const ariaLabel = interactive
      ? `${def.label} — общо ${formatGrams(mStats.totalGrams)} г, ${mStats.trainedOnDate ? 'тренирано днес, натисни за премахване' : 'натисни за тренировка днес'}`
      : `${def.label} — натрупани ${formatGrams(mStats.totalGrams)} г до избраната дата`;

    return {
      'data-testid': `${testIdPrefix}-muscle-${muscleId}`,
      'data-trained': mStats.trainedOnDate ? 'true' : 'false',
      'data-fatigued': isFatigued ? 'true' : 'false',
      'data-interactive': interactive ? 'true' : 'false',
      role: interactive ? 'button' : 'img',
      tabIndex: 0,
      className: 'muscle-zone outline-none focus:outline-none',
      'aria-label': ariaLabel,
      'aria-pressed': interactive ? mStats.trainedOnDate : undefined,
      onClick: () => handleMuscleInteraction(muscleId),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleMuscleInteraction(muscleId);
        }
      },
      onMouseEnter: () => handleShowTooltip(muscleId),
      onFocus: () => handleShowTooltip(muscleId),
      onMouseLeave: () => setHoveredMuscle(null),
      onBlur: () => setHoveredMuscle(null),
      style: {
        fill: colors.fill,
        stroke: isHovered ? '#ffffff' : colors.stroke,
        strokeWidth: isHovered ? 2 : colors.strokeWidth,
        cursor: interactive ? 'pointer' : 'help',
      } as React.CSSProperties,
    };
  }

  const hoveredStats = hoveredMuscle ? stats.byMuscle[hoveredMuscle.muscleId] : null;
  const hoveredDef = hoveredMuscle ? MUSCLE_MAP[hoveredMuscle.muscleId] : null;

  return (
    <div
      className="relative mx-auto flex w-full max-w-[300px] flex-col items-center select-none"
      data-testid={`${testIdPrefix}-figure`}
    >
      <svg
        key={hasFlipped ? view : 'initial'}
        viewBox="0 0 320 520"
        className={`h-auto w-full max-h-[365px] ${
          hasFlipped
            ? view === 'front'
              ? 'body-turn-front'
              : 'body-turn-back'
            : ''
        }`}
        aria-label={figureLabel}
      >
        <defs>
          <linearGradient id={`${testIdPrefix}-silhouette`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1c2536" />
            <stop offset="100%" stopColor="#111723" />
          </linearGradient>
        </defs>

        {/* Base human body silhouette (pointerEvents none so muscle zones own all clicks) */}
        <g
          pointerEvents="none"
          fill={`url(#${testIdPrefix}-silhouette)`}
          stroke={isFatigued ? 'rgba(248, 113, 113, 0.34)' : 'rgba(148, 163, 184, 0.24)'}
          strokeWidth="1.25"
        >
          {/* Head & Jaw */}
          <path d="M160 16 C173 16 182 27 182 43 C182 59 172 70 160 70 C148 70 138 59 138 43 C138 27 147 16 160 16 Z" />
          {/* Neck */}
          <path d="M148 67 L172 67 L177 92 L143 92 Z" />
          {/* Torso & Pelvis */}
          <path d="M114 95 Q160 87 206 95 L217 139 L198 226 L194 270 L160 280 L126 270 L122 226 L103 139 Z" />
          {/* Left Arm */}
          <path d="M104 101 L82 114 L64 195 L48 253 L37 274 L51 281 L66 256 L86 200 L106 141 Z" />
          {/* Right Arm */}
          <path d="M216 101 L238 114 L256 195 L272 253 L283 274 L269 281 L254 256 L234 200 L214 141 Z" />
          {/* Left Leg */}
          <path d="M126 268 L157 278 L152 384 L146 476 L124 480 L120 382 L114 312 Z" />
          {/* Right Leg */}
          <path d="M194 268 L163 278 L168 384 L174 476 L196 480 L200 382 L206 312 Z" />
          {/* Feet */}
          <ellipse cx="133" cy="488" rx="14" ry="7" />
          <ellipse cx="187" cy="488" rx="14" ry="7" />
          {/* Subtle anatomical contour lines */}
          <path d="M122 98 Q160 108 198 98" fill="none" stroke="rgba(148,163,184,0.16)" strokeWidth="1" />
          <path d="M128 380 Q136 376 146 380" fill="none" stroke="rgba(148,163,184,0.16)" strokeWidth="1" />
          <path d="M174 380 Q184 376 192 380" fill="none" stroke="rgba(148,163,184,0.16)" strokeWidth="1" />
        </g>

        {view === 'front' ? (
          <g>
            {/* Shoulders (Front Deltoids) */}
            <g {...renderMuscleProps('shoulders')}>
              <path
                data-testid={`${testIdPrefix}-hit-shoulders`}
                d="M114 96 C94 98 81 114 82 135 C92 139 103 134 112 118 Z"
              />
              <path d="M206 96 C226 98 239 114 238 135 C228 139 217 134 208 118 Z" />
            </g>

            {/* Chest (Pectorals) */}
            <g {...renderMuscleProps('chest')}>
              <rect x="114" y="108" width="92" height="46" fill="transparent" stroke="none" />
              <path
                data-testid={`${testIdPrefix}-hit-chest`}
                d="M116 108 Q138 104 157 118 L157 154 Q134 160 112 144 Q110 124 116 108 Z"
              />
              <path d="M204 108 Q182 104 163 118 L163 154 Q186 160 208 144 Q210 124 204 108 Z" />
            </g>

            {/* Biceps */}
            <g {...renderMuscleProps('biceps')}>
              <path
                data-testid={`${testIdPrefix}-hit-biceps`}
                d="M82 142 C72 156 68 176 72 194 C82 196 92 184 98 158 C95 147 89 142 82 142 Z"
              />
              <path d="M238 142 C248 156 252 176 248 194 C238 196 228 184 222 158 C225 147 231 142 238 142 Z" />
            </g>

            {/* Abs (Rectus Abdominis) */}
            <g {...renderMuscleProps('abs')}>
              <rect x="138" y="162" width="44" height="100" fill="transparent" stroke="none" />
              <rect data-testid={`${testIdPrefix}-hit-abs`} x="139" y="162" width="18" height="20" rx="5" />
              <rect x="163" y="162" width="18" height="20" rx="5" />
              <rect x="140" y="186" width="17" height="20" rx="5" />
              <rect x="163" y="186" width="17" height="20" rx="5" />
              <rect x="142" y="210" width="15" height="20" rx="5" />
              <rect x="163" y="210" width="15" height="20" rx="5" />
              <path d="M144 234 L176 234 L168 262 L152 262 Z" />
            </g>

            {/* Legs (Quadriceps & Lower Legs) */}
            <g {...renderMuscleProps('legs')}>
              <path
                data-testid={`${testIdPrefix}-hit-legs`}
                d="M122 278 Q139 282 154 290 L148 372 Q134 376 122 366 Q114 324 122 278 Z"
              />
              <path d="M198 278 Q181 282 166 290 L172 372 Q186 376 198 366 Q206 324 198 278 Z" />
              <path d="M124 392 Q136 388 146 394 L144 462 L126 462 Z" />
              <path d="M196 392 Q184 388 174 394 L176 462 L194 462 Z" />
            </g>
          </g>
        ) : (
          <g>
            {/* Shoulders (Rear Delts) */}
            <g {...renderMuscleProps('shoulders')}>
              <path
                data-testid={`${testIdPrefix}-hit-shoulders`}
                d="M114 96 C94 98 81 114 82 135 C92 139 103 134 112 118 Z"
              />
              <path d="M206 96 C226 98 239 114 238 135 C228 139 217 134 208 118 Z" />
            </g>

            {/* Back (Traps, Lats, Lower Back) */}
            <g {...renderMuscleProps('back')}>
              <rect x="116" y="88" width="88" height="168" fill="transparent" stroke="none" />
              <path
                data-testid={`${testIdPrefix}-hit-back`}
                d="M144 86 L176 86 L196 112 L160 132 L124 112 Z"
              />
              <path d="M116 118 L156 138 L154 216 L128 208 Q112 164 116 118 Z" />
              <path d="M204 118 L164 138 L166 216 L192 208 Q208 164 204 118 Z" />
              <path d="M136 216 L184 216 L178 256 L142 256 Z" />
            </g>

            {/* Triceps */}
            <g {...renderMuscleProps('triceps')}>
              <path
                data-testid={`${testIdPrefix}-hit-triceps`}
                d="M84 140 C72 154 68 176 74 196 C84 196 94 182 99 156 C95 146 90 140 84 140 Z"
              />
              <path d="M236 140 C248 154 252 176 246 196 C236 196 226 182 221 156 C225 146 230 140 236 140 Z" />
            </g>

            {/* Legs (Glutes, Hamstrings, Calves) */}
            <g {...renderMuscleProps('legs')}>
              <path
                data-testid={`${testIdPrefix}-hit-legs`}
                d="M126 262 Q142 256 158 266 L156 302 Q135 308 121 292 Z"
              />
              <path d="M194 262 Q178 256 162 266 L164 302 Q185 308 199 292 Z" />
              <path d="M122 306 Q138 310 154 306 L148 372 Q134 376 122 368 Z" />
              <path d="M198 306 Q182 310 166 306 L172 372 Q186 376 198 368 Z" />
              <path d="M122 388 Q136 382 148 392 L144 448 Q134 456 124 444 Z" />
              <path d="M198 388 Q184 382 172 392 L176 448 Q186 456 196 444 Z" />
            </g>
          </g>
        )}
      </svg>

      {/* Hover / Focus Tooltip Bubble ("малко балонче") */}
      {hoveredMuscle && hoveredStats && hoveredDef && (
        <div
          role="tooltip"
          data-testid={`${testIdPrefix}-tooltip`}
          className="tooltip-pop pointer-events-none absolute z-30 w-64 rounded-xl border border-white/15 bg-[#0A0E16]/95 p-3 shadow-2xl backdrop-blur-sm"
          style={{
            left: `${Math.min(82, Math.max(18, hoveredMuscle.xPercent))}%`,
            top: `${Math.max(18, hoveredMuscle.yPercent)}%`,
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-display text-sm font-bold text-white">
              {hoveredDef.label}
            </span>
            <span
              className={`font-mono text-xs font-semibold tabular-nums ${
                isFatigued && hoveredStats.trainedOnDate
                  ? 'text-rose-400'
                  : hoveredStats.trainedOnDate
                    ? 'text-[var(--accent-text)]'
                    : 'text-slate-400'
              }`}
            >
              {hoveredStats.trainedOnDate
                ? `+${formatGrams(hoveredStats.gainedOnDate)} г`
                : 'Почивка'}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-200">
            {hoveredDef.label} – досега си натрупал общо{' '}
            <span className="font-mono font-bold tabular-nums text-white">
              {formatGrams(hoveredStats.totalGrams)} грама
            </span>{' '}
            маса тук.
          </p>
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400">
            <span className="font-mono tabular-nums">
              {hoveredStats.workoutCount} тренировки
            </span>
            {interactive && (
              <>
                <span aria-hidden="true">·</span>
                <span>Кликни за отбелязване</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
