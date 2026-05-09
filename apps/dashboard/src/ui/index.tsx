import { Activity, AlertTriangle, RefreshCw } from 'lucide-react';

import { formatOrderStatus } from '../lib/formatters';
import { DashboardApiError, type OrderStatusName } from '../lib/portfolio-api';

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof DashboardApiError) {
    if (error.code === 'INSTRUMENT_ALREADY_ATTACHED') {
      return 'This instrument is already configured for the selected portfolio.';
    }

    if (error.code === 'INSTRUMENT_METADATA_CONFLICT') {
      return 'An instrument with this symbol and venue already exists with different metadata.';
    }

    if (error.status === 404) {
      return 'Portfolio was not found. Select another portfolio and try again.';
    }

    if (error.status === 409) {
      return error.message;
    }

    return error.message;
  }

  return error instanceof Error ? error.message : String(error);
};

export function StatusBanner({
  error,
  isRefreshing,
}: {
  error?: string;
  isRefreshing: boolean;
}) {
  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100">
        <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{error}</p>
      </div>
    );
  }

  if (isRefreshing) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/40 dark:text-cyan-100">
        <RefreshCw aria-hidden="true" className="h-4 w-4 animate-spin" />
        <p>Refreshing portfolio state...</p>
      </div>
    );
  }

  return null;
}

const statusColors: Record<OrderStatusName, string> = {
  filled:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  partially_filled:
    'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  placed: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200',
  cancelled: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400',
  rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
};

export function StatusPill({ status }: { status: OrderStatusName }) {
  return (
    <span
      className={`rounded-md px-2 py-1 text-xs font-medium ${statusColors[status]}`}
    >
      {formatOrderStatus(status)}
    </span>
  );
}

export function SidePill({ value }: { value: string }) {
  return (
    <span className="rounded-md bg-fuchsia-100 px-2 py-1 text-xs font-medium text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-200">
      {value}
    </span>
  );
}

export function SectionHeading({
  Icon,
  subtitle,
  title,
}: {
  Icon: typeof Activity;
  subtitle: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-200">
        <Icon aria-hidden="true" className="h-4 w-4" />
      </span>
      <div>
        <h2 className="font-semibold text-zinc-950 dark:text-white">{title}</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>
      </div>
    </div>
  );
}

export function EmptyState({
  description,
  Icon,
  title,
}: {
  description: string;
  Icon: typeof Activity;
  title: string;
}) {
  return (
    <section className="rounded-md border border-dashed border-zinc-300 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-950">
      <Icon
        aria-hidden="true"
        className="mx-auto h-6 w-6 text-zinc-400 dark:text-zinc-500"
      />
      <h2 className="mt-3 font-semibold text-zinc-950 dark:text-white">
        {title}
      </h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        {description}
      </p>
    </section>
  );
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-normal text-zinc-500 dark:text-zinc-400">
        {label}
      </dt>
      <dd className="mt-1 wrap-break-word font-medium text-zinc-950 dark:text-white">
        {value}
      </dd>
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {['summary', 'exposure', 'positions', 'orders'].map((item) => (
        <div
          className="h-28 animate-pulse rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
          key={item}
        />
      ))}
    </div>
  );
}
