import { useMemo } from 'react';
import { Activity, AlertTriangle, CheckCircle2, HeartPulse, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { DailyBiometricLog } from '../../types/fitness';
import { analyzeBiometricRadar } from '../../utils/biometricRadarAndDetective';
import { formatBgNumericDate, formatNumberBg } from '../../utils/fitnessMath';

interface BiometricRadarCardProps {
  dailyLogs: DailyBiometricLog[];
  todayKey: string;
}

export function BiometricRadarCard({
  dailyLogs,
  todayKey,
}: BiometricRadarCardProps) {
  const radar = useMemo(
    () => analyzeBiometricRadar({ dailyLogs, todayKey }),
    [dailyLogs, todayKey],
  );

  const containerClass =
    radar.status === 'alert'
      ? 'border-rose-500/55 bg-rose-950/30'
      : radar.status === 'caution'
        ? 'border-amber-500/45 bg-amber-950/20'
        : radar.status === 'normal'
          ? 'border-emerald-500/35 bg-[#0F1620]'
          : 'border-white/10 bg-[#0F141F]';

  const statusTextClass =
    radar.status === 'alert'
      ? 'text-rose-300'
      : radar.status === 'caution'
        ? 'text-amber-300'
        : radar.status === 'normal'
          ? 'text-emerald-400'
          : 'text-slate-400';

  const StatusIcon =
    radar.status === 'alert'
      ? ShieldAlert
      : radar.status === 'caution'
        ? AlertTriangle
        : radar.status === 'normal'
          ? ShieldCheck
          : Activity;

  const rhrDeltaLabel =
    radar.rhrDeltaBpm !== null
      ? `${radar.rhrDeltaBpm > 0 ? '+' : ''}${formatNumberBg(radar.rhrDeltaBpm)} bpm`
      : null;

  const hrvDeltaPct =
    radar.hrvDropPct !== null ? Math.round(-radar.hrvDropPct * 10) / 10 : null;
  const hrvDeltaLabel =
    hrvDeltaPct !== null
      ? `${hrvDeltaPct > 0 ? '+' : ''}${formatNumberBg(hrvDeltaPct)}%`
      : null;

  return (
    <section
      data-testid="biometric-radar-card"
      data-radar-status={radar.status}
      aria-label="Биометричен радар (24–48 ч. превенция)"
      className={`rounded-2xl border p-4 sm:p-5 ${containerClass}`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <StatusIcon className={`h-4 w-4 shrink-0 ${statusTextClass}`} aria-hidden="true" />
            <span className={statusTextClass}>
              🛡️ Биометричен радар (24–48 ч. превенция)
            </span>
            {radar.latestDate && (
              <span className="font-mono text-[11px] font-normal tabular-nums text-slate-400">
                · Данни до {formatBgNumericDate(radar.latestDate)} → оценка за ДНЕС ({formatBgNumericDate(todayKey)})
              </span>
            )}
          </div>

          <p
            data-testid="biometric-radar-banner"
            className={`mt-1.5 text-sm font-bold leading-snug ${
              radar.status === 'alert'
                ? 'text-rose-100'
                : radar.status === 'caution'
                  ? 'text-amber-100'
                  : 'text-white'
            }`}
          >
            {radar.bannerText}
          </p>

          <p className="mt-1 text-xs leading-relaxed text-slate-300">
            {radar.subText}
          </p>
        </div>

        {/* Live RHR & HRV baseline comparison strip */}
        {radar.status !== 'no_data' && (
          <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-3 lg:border-t-0 lg:border-l lg:pl-4 lg:pt-0 shrink-0">
            <div className="min-w-[120px]">
              <div className="flex items-center gap-1 text-[11px] text-slate-400">
                <HeartPulse className="h-3 w-3 text-rose-400" aria-hidden="true" />
                <span>Пулс (30-дн. база)</span>
              </div>
              <div className="mt-0.5 font-mono text-sm font-bold tabular-nums text-white">
                {radar.rhrLatest !== null ? `${radar.rhrLatest} bpm` : '—'}
                {rhrDeltaLabel && (
                  <span
                    className={`ml-1.5 text-xs font-semibold ${
                      radar.rhrDeltaBpm !== null && radar.rhrDeltaBpm >= 4
                        ? 'text-rose-400'
                        : radar.rhrDeltaBpm !== null && radar.rhrDeltaBpm >= 2
                          ? 'text-amber-300'
                          : 'text-emerald-400'
                    }`}
                  >
                    ({rhrDeltaLabel})
                  </span>
                )}
              </div>
              <div className="font-mono text-[10px] tabular-nums text-slate-500">
                {radar.rhrBaseline30d !== null
                  ? `Норма: ${formatNumberBg(radar.rhrBaseline30d)} bpm`
                  : 'Нужни ≥3 записа'}
              </div>
            </div>

            <div className="min-w-[120px]">
              <div className="flex items-center gap-1 text-[11px] text-slate-400">
                <Activity className="h-3 w-3 text-sky-400" aria-hidden="true" />
                <span>HRV (30-дн. база)</span>
              </div>
              <div className="mt-0.5 font-mono text-sm font-bold tabular-nums text-white">
                {radar.hrvLatest !== null ? `${formatNumberBg(radar.hrvLatest)} ms` : '—'}
                {hrvDeltaLabel && (
                  <span
                    className={`ml-1.5 text-xs font-semibold ${
                      radar.hrvDropAlert
                        ? 'text-rose-400'
                        : radar.hrvDropPct !== null && radar.hrvDropPct >= 10
                          ? 'text-amber-300'
                          : 'text-emerald-400'
                    }`}
                  >
                    ({hrvDeltaLabel})
                  </span>
                )}
              </div>
              <div className="font-mono text-[10px] tabular-nums text-slate-500">
                {radar.hrvBaseline30d !== null
                  ? `Норма: ${formatNumberBg(radar.hrvBaseline30d)} ms`
                  : 'От Huawei Watch'}
              </div>
            </div>

            {radar.status === 'normal' && (
              <div className="hidden xl:flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Готовност</span>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
