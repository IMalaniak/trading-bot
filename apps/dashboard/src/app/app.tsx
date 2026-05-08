import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Layers3,
  ListChecks,
  RefreshCw,
  Search,
  Send,
  Wallet,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import {
  exposureUsagePercent,
  formatDateTime,
  formatDecimal,
  formatNotional,
  formatOrderStatus,
  formatSignalSide,
} from './formatters';
import {
  createDashboardApi,
  DashboardApiError,
  DEFAULT_PORTFOLIO_ID,
  type ExecutionOrderDto,
  type InstrumentDto,
  type PortfolioPositionDto,
  type PortfolioReadResponseDto,
  type RegisterInstrumentRequestDto,
} from './portfolio-api';
import { ThemeProvider, ThemeToggle } from './theme';

type LoadStatus = 'idle' | 'loading' | 'success' | 'error';

interface PortfolioState {
  data?: PortfolioReadResponseDto;
  error?: string;
  status: LoadStatus;
  isRefreshing: boolean;
}

interface RegistrationState {
  error?: string;
  instrument?: InstrumentDto;
  isSubmitting: boolean;
}

const api = createDashboardApi();

const initialPortfolioState: PortfolioState = {
  status: 'idle',
  isRefreshing: false,
};

const initialRegistrationForm: RegisterInstrumentRequestDto = {
  symbol: '',
  assetClass: 'crypto',
  venue: 'BINANCE',
  externalSymbol: '',
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof DashboardApiError) {
    if (error.status === 404) {
      return 'Portfolio was not found. Check the portfolio ID and try again.';
    }

    if (error.status === 409) {
      return 'Instrument already exists.';
    }

    return error.message;
  }

  return error instanceof Error ? error.message : String(error);
};

const trimRegistrationPayload = (
  form: RegisterInstrumentRequestDto,
): RegisterInstrumentRequestDto => ({
  symbol: form.symbol.trim(),
  assetClass: form.assetClass,
  venue: form.venue.trim().toUpperCase(),
  externalSymbol: form.externalSymbol?.trim() || undefined,
});

const getInstrumentLabel = (instrument?: InstrumentDto): string =>
  instrument
    ? `${instrument.symbol} on ${instrument.venue}`
    : 'Instrument details unavailable';

function StatusBanner({
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

function PortfolioSummary({ data }: { data: PortfolioReadResponseDto }) {
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

function PositionsView({ positions }: { positions: PortfolioPositionDto[] }) {
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

function RecentOrdersView({ orders }: { orders: ExecutionOrderDto[] }) {
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
                  <StatusPill value={formatOrderStatus(order.status)} />
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
                          <StatusPill
                            value={formatOrderStatus(fill.orderStatus)}
                          />
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

function InstrumentRegistration() {
  const [form, setForm] = useState<RegisterInstrumentRequestDto>(
    initialRegistrationForm,
  );
  const [state, setState] = useState<RegistrationState>({
    isSubmitting: false,
  });

  const payload = useMemo(() => trimRegistrationPayload(form), [form]);
  const isValid = payload.symbol.length > 0 && payload.venue.length > 0;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isValid) {
      setState({
        isSubmitting: false,
        error: 'Symbol and venue are required.',
      });
      return;
    }

    setState({ isSubmitting: true });

    try {
      const instrument = await api.registerInstrument(payload);
      setState({ isSubmitting: false, instrument });
    } catch (error) {
      setState({
        isSubmitting: false,
        error: getErrorMessage(error),
      });
    }
  };

  return (
    <section
      aria-labelledby="registration-heading"
      className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <SectionHeading
        Icon={Send}
        subtitle="Submits through API Gateway"
        title="Register Instrument"
      />
      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-200">
          Symbol
          <input
            className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-zinc-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
            onChange={(event) =>
              setForm((current) => ({ ...current, symbol: event.target.value }))
            }
            placeholder="BTC/USDT"
            value={form.symbol}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-200">
            Asset class
            <select
              className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-zinc-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  assetClass: event.target
                    .value as RegisterInstrumentRequestDto['assetClass'],
                }))
              }
              value={form.assetClass}
            >
              <option value="crypto">Crypto</option>
              <option value="stock">Stock</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-200">
            Venue
            <input
              className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-zinc-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  venue: event.target.value,
                }))
              }
              placeholder="BINANCE"
              value={form.venue}
            />
          </label>
        </div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-200">
          External symbol
          <input
            className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-zinc-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                externalSymbol: event.target.value,
              }))
            }
            placeholder="BTCUSDT"
            value={form.externalSymbol ?? ''}
          />
        </label>

        {state.error ? (
          <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
            {state.error}
          </p>
        ) : null}
        {state.instrument ? (
          <p className="flex items-center gap-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
            Registered {state.instrument.symbol} as {state.instrument.id}.
          </p>
        ) : null}

        <button
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          disabled={!isValid || state.isSubmitting}
          type="submit"
        >
          <Send aria-hidden="true" className="h-4 w-4" />
          {state.isSubmitting ? 'Registering...' : 'Register'}
        </button>
      </form>
    </section>
  );
}

function DashboardPage() {
  const [portfolioInput, setPortfolioInput] = useState(DEFAULT_PORTFOLIO_ID);
  const [portfolioId, setPortfolioId] = useState(DEFAULT_PORTFOLIO_ID);
  const [state, setState] = useState<PortfolioState>(initialPortfolioState);

  const loadPortfolio = useCallback(
    async (nextPortfolioId: string, keepData = false) => {
      setState((current) => ({
        data: keepData ? current.data : undefined,
        status: keepData && current.data ? 'success' : 'loading',
        isRefreshing: keepData && Boolean(current.data),
      }));

      try {
        const data = await api.getPortfolio(nextPortfolioId);
        setState({ data, status: 'success', isRefreshing: false });
      } catch (error) {
        setState((current) => ({
          data: keepData ? current.data : undefined,
          error: getErrorMessage(error),
          status: 'error',
          isRefreshing: false,
        }));
      }
    },
    [],
  );

  useEffect(() => {
    void loadPortfolio(portfolioId);
  }, [loadPortfolio, portfolioId]);

  const applyPortfolioId = () => {
    const nextPortfolioId = portfolioInput.trim();

    if (nextPortfolioId && nextPortfolioId !== portfolioId) {
      setPortfolioId(nextPortfolioId);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-normal text-cyan-700 dark:text-cyan-300">
                Trading Bot MVP
              </p>
              <p className="text-lg font-semibold text-zinc-950 dark:text-white">
                Dashboard Console
              </p>
            </div>
            <ThemeToggle />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">Portfolio ID</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
              />
              <input
                className="h-11 w-full rounded-md border border-zinc-300 bg-white pl-9 pr-3 text-sm text-zinc-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                onChange={(event) => setPortfolioInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    applyPortfolioId();
                  }
                }}
                value={portfolioInput}
              />
            </label>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                onClick={applyPortfolioId}
                type="button"
              >
                Apply
              </button>
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-cyan-600 px-4 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={state.status === 'loading' || state.isRefreshing}
                onClick={() => void loadPortfolio(portfolioId, true)}
                type="button"
              >
                <RefreshCw
                  aria-hidden="true"
                  className={`h-4 w-4 ${state.isRefreshing ? 'animate-spin' : ''}`}
                />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
        <div className="space-y-5">
          <StatusBanner error={state.error} isRefreshing={state.isRefreshing} />

          {state.status === 'loading' ? (
            <LoadingState />
          ) : state.data ? (
            <>
              <PortfolioSummary data={state.data} />
              <PositionsView positions={state.data.positions} />
              <RecentOrdersView orders={state.data.recentOrders} />
            </>
          ) : state.status === 'error' ? (
            <EmptyState
              Icon={AlertTriangle}
              title="Portfolio unavailable"
              description="The dashboard could not load portfolio state from API Gateway."
            />
          ) : null}
        </div>
        <aside className="space-y-5">
          <InstrumentRegistration />
        </aside>
      </div>
    </main>
  );
}

function LoadingState() {
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

function SectionHeading({
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

function EmptyState({
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-normal text-zinc-500 dark:text-zinc-400">
        {label}
      </dt>
      <dd className="mt-1 break-words font-medium text-zinc-950 dark:text-white">
        {value}
      </dd>
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  return (
    <span className="rounded-md bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
      {value}
    </span>
  );
}

function SidePill({ value }: { value: string }) {
  return (
    <span className="rounded-md bg-fuchsia-100 px-2 py-1 text-xs font-medium text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-200">
      {value}
    </span>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route element={<DashboardPage />} path="/" />
        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </ThemeProvider>
  );
}

export default App;
