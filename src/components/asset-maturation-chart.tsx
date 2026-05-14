'use client';

import { useMemo, useRef, useState, type PointerEvent } from 'react';

type AssetMaturationPoint = {
  date: string;
  label: string;
  x: number;
  longTermRune: number;
  shortTermRune: number;
  totalRune: number;
  longTermPercent: number;
  shortTermPercent: number;
  runeMaturing?: number;
};

type AssetMaturationChartProps = {
  points: AssetMaturationPoint[];
};

const CHART = {
  width: 1000,
  height: 380,
  left: 48,
  right: 936,
  top: 36,
  bottom: 286,
};

export function AssetMaturationChart({ points }: AssetMaturationChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const chartPoints = useMemo(() => points.map((point) => ({ ...point, y: percentToY(point.longTermPercent) })), [points]);
  const activePoint = activeIndex === null ? null : chartPoints[activeIndex] ?? null;
  const path = buildStepPath(chartPoints);
  const monthTicks = useMemo(() => buildMonthTicks(chartPoints), [chartPoints]);
  const tooltipPosition = activePoint ? getTooltipPosition(activePoint.x, activePoint.y) : null;

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!svgRef.current || chartPoints.length === 0) return;
    const bounds = svgRef.current.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * CHART.width;
    const y = ((event.clientY - bounds.top) / bounds.height) * CHART.height;
    const nearest = chartPoints.reduce(
      (best, point, index) => {
        const distance = Math.hypot(point.x - x, point.y - y);
        return distance < best.distance ? { index, distance } : best;
      },
      { index: -1, distance: Number.POSITIVE_INFINITY },
    );

    setActiveIndex(nearest.distance <= 28 ? nearest.index : null);
  }

  if (chartPoints.length === 0) {
    return <div className="rounded-2xl border border-slate-800 bg-[#0d1b2b] p-6 text-sm text-slate-400">No maturity data available yet.</div>;
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-[#0d1b2b] p-4">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART.width} ${CHART.height}`}
        className="h-[380px] w-full cursor-default select-none"
        role="img"
        aria-label="Asset maturation step curve with month timeline and hoverable short-term and long-term RUNE details"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setActiveIndex(null)}
      >
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = percentToY(tick);
          return (
            <g key={tick}>
              <line x1={CHART.left} x2={CHART.right} y1={y} y2={y} stroke="#1e3348" strokeWidth="1" />
              <text x="956" y={y + 6} fill="#94a3b8" fontSize="18">{tick}%</text>
            </g>
          );
        })}

        <line x1={CHART.left} x2={CHART.right} y1={CHART.bottom} y2={CHART.bottom} stroke="#cbd5e1" strokeWidth="1.5" opacity="0.8" />
        {monthTicks.map((tick) => (
          <g key={tick.key}>
            <line x1={tick.x} x2={tick.x} y1={CHART.bottom} y2={CHART.bottom + 8} stroke="#94a3b8" strokeWidth="1" opacity="0.8" />
            <line x1={tick.x} x2={tick.x} y1={CHART.top} y2={CHART.bottom} stroke="#1e3348" strokeWidth="1" opacity="0.35" />
            <text x={tick.x} y={CHART.bottom + 30} textAnchor="middle" fill="#cbd5e1" fontSize="15" fontWeight="700">{tick.label}</text>
            {tick.showYear ? <text x={tick.x} y={CHART.bottom + 50} textAnchor="middle" fill="#64748b" fontSize="12">{tick.year}</text> : null}
          </g>
        ))}
        <path d={path} fill="none" stroke="#38bdf8" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <path d={`${path} L ${chartPoints.at(-1)?.x ?? CHART.left} ${CHART.bottom} L ${CHART.left} ${CHART.bottom} Z`} fill="#38bdf8" opacity="0.08" />

        {chartPoints.map((point, index) => {
          const isActive = index === activeIndex;
          return (
            <g key={`${point.date}-${index}`} className="cursor-pointer">
              <circle cx={point.x} cy={point.y} r={isActive ? 9 : 5} fill={isActive ? '#0d1b2b' : '#67e8f9'} stroke="#67e8f9" strokeWidth={isActive ? 3 : 0} />
              <circle cx={point.x} cy={point.y} r="22" fill="transparent" />
            </g>
          );
        })}

        {activePoint && tooltipPosition ? (
          <>
            <line x1={activePoint.x} x2={activePoint.x} y1={CHART.top} y2={CHART.bottom} stroke="#cbd5e1" strokeDasharray="5 5" opacity="0.7" />
            <circle cx={activePoint.x} cy={activePoint.y} r="12" fill="#38bdf8" opacity="0.2" />
            <circle cx={activePoint.x} cy={activePoint.y} r="7" fill="#38bdf8" stroke="#e0f2fe" strokeWidth="2" />

            <g transform={`translate(${tooltipPosition.x} ${tooltipPosition.y})`} pointerEvents="none">
          <rect width="330" height={activePoint.runeMaturing ? 174 : 148} rx="10" fill="#16263a" stroke="#23384f" filter="drop-shadow(0 8px 14px rgb(0 0 0 / 0.35))" />
          <text x="16" y="26" fill="#e2e8f0" fontSize="16" fontWeight="700">{formatFullDate(activePoint.date)}</text>
          <text x="16" y="54" fill="#94a3b8" fontSize="14">{activePoint.label}</text>

          <circle cx="20" cy="82" r="5" fill="#34d399" />
          <text x="34" y="88" fill="#e2e8f0" fontSize="15" fontWeight="700">Long term</text>
          <text x="126" y="88" fill="#67e8f9" fontSize="15">{formatRuneNumber(activePoint.longTermRune)} RUNE</text>
          <text x="254" y="88" fill="#67e8f9" fontSize="15">{formatPercent(activePoint.longTermPercent)}</text>

          <circle cx="20" cy="112" r="5" fill="#f0abfc" />
          <text x="34" y="118" fill="#e2e8f0" fontSize="15" fontWeight="700">Short term</text>
          <text x="126" y="118" fill="#f0abfc" fontSize="15">{formatRuneNumber(activePoint.shortTermRune)} RUNE</text>
          <text x="254" y="118" fill="#f0abfc" fontSize="15">{formatPercent(activePoint.shortTermPercent)}</text>

          <text x="16" y="144" fill="#94a3b8" fontSize="14">Total tracked: {formatRuneNumber(activePoint.totalRune)} RUNE</text>
          {activePoint.runeMaturing ? <text x="16" y="170" fill="#bae6fd" fontSize="14">Maturing on this date: {formatRuneNumber(activePoint.runeMaturing)} RUNE</text> : null}
            </g>
          </>
        ) : null}
      </svg>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
        <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400" />Long-term RUNE</span>
        <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-fuchsia-300" />Short-term RUNE shown in tooltip</span>
        <span>Hover over a date dot to inspect that maturity step.</span>
      </div>
    </div>
  );
}

function percentToY(percent: number) {
  const clamped = Math.min(Math.max(percent, 0), 100);
  return CHART.bottom - ((CHART.bottom - CHART.top) * clamped) / 100;
}

function buildStepPath(points: Array<AssetMaturationPoint & { y: number }>) {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  return rest.reduce((path, point) => `${path} H ${point.x} V ${point.y}`, `M ${first.x} ${first.y}`);
}

function buildMonthTicks(points: Array<AssetMaturationPoint & { y: number }>) {
  if (points.length === 0) return [];

  const firstDate = new Date(points[0].date);
  const lastDate = new Date(points.at(-1)?.date ?? points[0].date);
  const startMonth = Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth(), 1);
  const endMonth = Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), 1);
  const startTime = firstDate.getTime();
  const endTime = Math.max(lastDate.getTime(), startTime + 1);
  const ticks: Array<{ key: string; x: number; label: string; year: string; showYear: boolean }> = [];

  for (let monthTime = startMonth; monthTime <= endMonth; monthTime = addUtcMonths(monthTime, 1)) {
    const date = new Date(monthTime);
    const ratio = Math.min(Math.max((date.getTime() - startTime) / (endTime - startTime), 0), 1);
    const x = CHART.left + ratio * (CHART.right - CHART.left);
    const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const year = String(date.getUTCFullYear());
    ticks.push({
      key: `${year}-${date.getUTCMonth()}`,
      x,
      label: month,
      year,
      showYear: date.getUTCMonth() === 0 || ticks.length === 0,
    });
  }

  return ticks;
}

function addUtcMonths(monthTime: number, months: number) {
  const date = new Date(monthTime);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1);
}

function getTooltipPosition(x: number, y: number) {
  const width = 330;
  const height = 174;
  const proposedX = x + 24;
  const proposedY = y - 92;

  return {
    x: proposedX + width > CHART.right ? x - width - 24 : proposedX,
    y: Math.min(Math.max(proposedY, CHART.top + 8), CHART.bottom - height - 8),
  };
}

function formatRuneNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value);
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}%`;
}

function formatFullDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}
