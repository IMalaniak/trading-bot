import { RefreshCw, Settings2 } from 'lucide-react';

import { formatDateTime, formatNotional } from '../lib/formatters';
import type { PortfolioInstrumentConfigDto } from '../lib/portfolio-api';
import { EmptyState, Metric, SectionHeading } from '../ui';

export function PortfolioInstrumentsView({
  instruments,
  onToggleEnabled,
  togglingInstrumentId,
}: {
  instruments: PortfolioInstrumentConfigDto[];
  onToggleEnabled?: (
    portfolioId: string,
    instrumentId: string,
    enabled: boolean,
  ) => void;
  togglingInstrumentId?: string;
}) {
  if (instruments.length === 0) {
    return (
      <EmptyState
        Icon={Settings2}
        title="No portfolio instruments"
        description="Add instruments to this portfolio to configure risk limits."
      />
    );
  }

  return (
    <section
      aria-labelledby="portfolio-instruments-heading"
      className="space-y-3"
    >
      <SectionHeading
        Icon={Settings2}
        subtitle="Configured markets and risk limits"
        title="Portfolio Instruments"
      />

      <div className="grid gap-3 md:hidden">
        {instruments.map((config) => (
          <article
            className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            key={`${config.portfolioId}-${config.instrument.id}`}
          >
            <InstrumentHeader
              config={config}
              isToggling={togglingInstrumentId === config.instrument.id}
              onToggleEnabled={onToggleEnabled}
            />
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Metric
                label="Target"
                value={formatNotional(config.targetNotional)}
              />
              <Metric
                label="Trade cap"
                value={formatNotional(config.maxTradeNotional)}
              />
              <Metric
                label="Position cap"
                value={formatNotional(config.maxPositionNotional)}
              />
              <Metric
                label="Updated"
                value={formatDateTime(config.updatedAt)}
              />
            </dl>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-md border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950 md:block">
        <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-normal text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3">Instrument</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Trade cap</th>
              <th className="px-4 py-3">Position cap</th>
              <th className="px-4 py-3">Updated</th>
              {onToggleEnabled ? <th className="px-4 py-3" /> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {instruments.map((config) => (
              <tr key={`${config.portfolioId}-${config.instrument.id}`}>
                <td className="px-4 py-3">
                  <div className="font-medium text-zinc-950 dark:text-white">
                    {config.instrument.symbol}
                  </div>
                  <div className="text-zinc-500 dark:text-zinc-400">
                    {config.instrument.venue}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge enabled={config.enabled} />
                </td>
                <td className="px-4 py-3">
                  {formatNotional(config.targetNotional)}
                </td>
                <td className="px-4 py-3">
                  {formatNotional(config.maxTradeNotional)}
                </td>
                <td className="px-4 py-3">
                  {formatNotional(config.maxPositionNotional)}
                </td>
                <td className="px-4 py-3">
                  {formatDateTime(config.updatedAt)}
                </td>
                {onToggleEnabled ? (
                  <td className="px-4 py-3">
                    <ToggleButton
                      config={config}
                      isToggling={togglingInstrumentId === config.instrument.id}
                      onToggleEnabled={onToggleEnabled}
                    />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ToggleButton({
  config,
  isToggling,
  onToggleEnabled,
}: {
  config: PortfolioInstrumentConfigDto;
  isToggling: boolean;
  onToggleEnabled: (
    portfolioId: string,
    instrumentId: string,
    enabled: boolean,
  ) => void;
}) {
  const label = isToggling
    ? `Updating ${config.instrument.symbol}`
    : config.enabled
      ? `Disable ${config.instrument.symbol}`
      : `Enable ${config.instrument.symbol}`;

  return (
    <button
      aria-label={label}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition ${
        config.enabled
          ? 'border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'
          : 'border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 dark:hover:bg-emerald-900'
      } disabled:cursor-not-allowed disabled:opacity-60`}
      disabled={isToggling}
      onClick={() =>
        onToggleEnabled(
          config.portfolioId,
          config.instrument.id,
          !config.enabled,
        )
      }
      type="button"
    >
      {isToggling ? (
        <RefreshCw aria-hidden="true" className="h-3 w-3 animate-spin" />
      ) : null}
      {isToggling ? 'Updating\u2026' : config.enabled ? 'Disable' : 'Enable'}
    </button>
  );
}

function InstrumentHeader({
  config,
  isToggling,
  onToggleEnabled,
}: {
  config: PortfolioInstrumentConfigDto;
  isToggling: boolean;
  onToggleEnabled?: (
    portfolioId: string,
    instrumentId: string,
    enabled: boolean,
  ) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="font-semibold text-zinc-950 dark:text-white">
          {config.instrument.symbol}
        </h3>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {config.instrument.venue}
        </p>
      </div>
      {onToggleEnabled ? (
        <ToggleButton
          config={config}
          isToggling={isToggling}
          onToggleEnabled={onToggleEnabled}
        />
      ) : (
        <StatusBadge enabled={config.enabled} />
      )}
    </div>
  );
}

function StatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded-md px-2 py-1 text-xs font-medium ${
        enabled
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
          : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300'
      }`}
    >
      {enabled ? 'Enabled' : 'Disabled'}
    </span>
  );
}
