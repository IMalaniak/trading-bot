import { ListChecks } from 'lucide-react';

import {
  formatDateTime,
  formatDecimal,
  formatNotional,
  formatSignalSide,
} from '../lib/formatters';
import type { ExecutionOrderDto, InstrumentDto } from '../lib/portfolio-api';
import {
  EmptyState,
  Metric,
  SectionHeading,
  SidePill,
  StatusPill,
} from '../ui';

const getInstrumentLabel = (instrument?: InstrumentDto): string =>
  instrument
    ? `${instrument.symbol} on ${instrument.venue}`
    : 'Instrument details unavailable';

export function RecentOrdersView({ orders }: { orders: ExecutionOrderDto[] }) {
  if (orders.length === 0) {
    return (
      <EmptyState
        Icon={ListChecks}
        title="No recent orders"
        description="Simulated execution orders will appear here after approved trades are processed."
      />
    );
  }

  return (
    <section aria-labelledby="orders-heading" className="space-y-3">
      <SectionHeading
        Icon={ListChecks}
        subtitle="Execution-owned order and fill lifecycle"
        title="Recent Orders"
      />
      <div className="space-y-3">
        {orders.map((order) => (
          <article
            className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            key={order.orderId}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-zinc-950 dark:text-white">
                    {order.orderId}
                  </h3>
                  <StatusPill status={order.status} />
                  <SidePill value={formatSignalSide(order.side)} />
                </div>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {getInstrumentLabel(order.instrument)}
                </p>
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Last activity {formatDateTime(order.lastActivityAt)}
              </p>
            </div>

            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Requested notional"
                value={formatNotional(order.requestedNotional)}
              />
              <Metric
                label="Requested quantity"
                value={formatDecimal(order.requestedQuantity)}
              />
              <Metric
                label="Reference price"
                value={formatDecimal(order.referencePrice)}
              />
              <Metric label="Placed" value={formatDateTime(order.placedAt)} />
            </dl>

            <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                Fills
              </h4>
              {order.fills.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  No fills reported for this order.
                </p>
              ) : (
                <ol className="mt-3 space-y-3">
                  {order.fills.map((fill) => (
                    <li className="flex gap-3" key={fill.fillId}>
                      <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                        {fill.sequence}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-mono text-xs text-zinc-700 dark:text-zinc-200">
                            {fill.fillId}
                          </p>
                          <StatusPill status={fill.orderStatus} />
                        </div>
                        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                          {formatDecimal(fill.fillQuantity)} at{' '}
                          {formatDecimal(fill.fillPrice)} for{' '}
                          {formatNotional(fill.fillNotional)} on{' '}
                          {formatDateTime(fill.filledAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
