import { RadioTower } from 'lucide-react';

import {
  formatDateTime,
  formatDecimal,
  formatSignalSide,
} from '../lib/formatters';
import type { SignalDto } from '../lib/portfolio-api';
import { EmptyState, SectionHeading, SidePill } from '../ui';

export function RecentSignalsView({
  error,
  isLoading,
  signals,
}: {
  error?: string;
  isLoading: boolean;
  signals: SignalDto[];
}) {
  if (isLoading) {
    return (
      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <SectionHeading
          Icon={RadioTower}
          subtitle="Latest Prediction Engine output"
          title="Recent Signals"
        />
        <div className="mt-4 space-y-3">
          {[0, 1, 2].map((item) => (
            <div
              className="h-16 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-900"
              key={item}
            />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100">
        {error}
      </section>
    );
  }

  if (signals.length === 0) {
    return (
      <EmptyState
        Icon={RadioTower}
        title="No recent signals"
        description="Prediction Engine signals will appear here after feature vectors are processed."
      />
    );
  }

  return (
    <section aria-labelledby="signals-heading" className="space-y-3">
      <SectionHeading
        Icon={RadioTower}
        subtitle="Latest Prediction Engine output"
        title="Recent Signals"
      />
      <div className="space-y-3">
        {signals.map((signal) => (
          <article
            className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            key={signal.id}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-xs text-zinc-700 dark:text-zinc-200">
                    {signal.id}
                  </p>
                  <SidePill value={formatSignalSide(signal.side)} />
                </div>
                <p className="mt-2 text-sm font-semibold text-zinc-950 dark:text-white">
                  {signal.instrumentId}
                </p>
              </div>
              <p className="shrink-0 text-right text-sm text-zinc-500 dark:text-zinc-400">
                {formatDateTime(new Date(signal.timestamp).toISOString())}
              </p>
            </div>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
              Reference price {formatDecimal(signal.price)}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
