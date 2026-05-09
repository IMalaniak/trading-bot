import { Layers3 } from 'lucide-react';

import { formatDecimal, formatNotional } from '../lib/formatters';
import type { PortfolioPositionDto } from '../lib/portfolio-api';
import { EmptyState, Metric, SectionHeading } from '../ui';

export function PositionsView({
  positions,
}: {
  positions: PortfolioPositionDto[];
}) {
  if (positions.length === 0) {
    return (
      <EmptyState
        Icon={Layers3}
        title="No open positions"
        description="The portfolio has no reconciled non-zero positions yet."
      />
    );
  }

  return (
    <section aria-labelledby="positions-heading" className="space-y-3">
      <SectionHeading
        Icon={Layers3}
        subtitle="Current reconciled position state"
        title="Open Positions"
      />

      <div className="grid gap-3 md:hidden">
        {positions.map((position) => (
          <article
            className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            key={`${position.instrument.id}-${position.lastFillId}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-zinc-950 dark:text-white">
                  {position.instrument.symbol}
                </h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {position.instrument.venue}
                </p>
              </div>
              <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                {position.instrument.assetClass}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Metric
                label="Quantity"
                value={formatDecimal(position.quantity)}
              />
              <Metric
                label="Avg entry"
                value={formatDecimal(position.averageEntryPrice)}
              />
              <Metric
                label="Exposure"
                value={formatNotional(position.exposureNotional)}
              />
              <Metric label="Last fill" value={position.lastFillId} />
            </dl>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-md border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950 md:block">
        <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-normal text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3">Instrument</th>
              <th className="px-4 py-3">Quantity</th>
              <th className="px-4 py-3">Avg entry</th>
              <th className="px-4 py-3">Exposure</th>
              <th className="px-4 py-3">Last fill</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {positions.map((position) => (
              <tr key={`${position.instrument.id}-${position.lastFillId}`}>
                <td className="px-4 py-3">
                  <div className="font-medium text-zinc-950 dark:text-white">
                    {position.instrument.symbol}
                  </div>
                  <div className="text-zinc-500 dark:text-zinc-400">
                    {position.instrument.venue}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {formatDecimal(position.quantity)}
                </td>
                <td className="px-4 py-3">
                  {formatDecimal(position.averageEntryPrice)}
                </td>
                <td className="px-4 py-3">
                  {formatNotional(position.exposureNotional)}
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {position.lastFillId}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
