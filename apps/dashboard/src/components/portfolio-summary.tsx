import { Activity, BookOpen, Clock3, Layers3, Wallet } from 'lucide-react';

import {
  exposureUsagePercent,
  formatDateTime,
  formatDecimal,
  formatNotional,
} from '../lib/formatters';
import type { PortfolioReadResponseDto } from '../lib/portfolio-api';

export function PortfolioSummary({ data }: { data: PortfolioReadResponseDto }) {
  const { summary } = data;
  const exposurePercent = exposureUsagePercent(
    summary.aggregateExposureNotional,
    summary.exposureCapNotional,
  );
  const summaryCards = [
    {
      label: 'Exposure cap',
      value: formatNotional(summary.exposureCapNotional),
      Icon: Wallet,
    },
    {
      label: 'Aggregate exposure',
      value: formatNotional(summary.aggregateExposureNotional),
      Icon: Activity,
    },
    {
      label: 'Open positions',
      value: String(summary.openPositionCount),
      Icon: Layers3,
    },
    {
      label: 'Last update',
      value: formatDateTime(summary.updatedAt),
      Icon: Clock3,
    },
  ];

  return (
    <section aria-labelledby="portfolio-summary" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-700 dark:text-cyan-300">
            {summary.portfolioId}
          </p>
          <h1
            className="mt-1 text-2xl font-semibold tracking-normal text-zinc-950 dark:text-white"
            id="portfolio-summary"
          >
            {summary.name}
          </h1>
        </div>
        <span
          className={`inline-flex w-fit items-center gap-2 rounded-md px-2.5 py-1 text-sm font-medium ${
            summary.isActive
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
              : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-current" />
          {summary.isActive ? 'Active' : 'Inactive'}
        </span>
        {data.strategy ? (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-violet-100 px-2.5 py-1 text-sm font-medium text-violet-800 dark:bg-violet-950 dark:text-violet-200">
            <BookOpen aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="text-xs text-violet-500 dark:text-violet-400">
              Strategy
            </span>
            {data.strategy.name}
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map(({ label, value, Icon }) => (
          <article
            className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            key={label}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {label}
                </p>
                <p className="mt-2 text-xl font-semibold text-zinc-950 dark:text-white">
                  {value}
                </p>
              </div>
              <Icon
                aria-hidden="true"
                className="h-5 w-5 text-cyan-600 dark:text-cyan-300"
              />
            </div>
          </article>
        ))}
      </div>

      <div className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-200">
            Exposure usage
          </span>
          <span className="text-zinc-500 dark:text-zinc-400">
            {formatDecimal(exposurePercent, 1)}%
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
          <div
            aria-label="Exposure usage"
            className="h-full rounded bg-cyan-500"
            style={{ width: `${exposurePercent}%` }}
          />
        </div>
      </div>
    </section>
  );
}
