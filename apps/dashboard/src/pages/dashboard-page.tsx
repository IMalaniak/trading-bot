import { AlertTriangle, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { InstrumentRegistration } from '../components/instrument-registration';
import { PortfolioSummary } from '../components/portfolio-summary';
import { PositionsView } from '../components/positions-view';
import { RecentOrdersView } from '../components/recent-orders-view';
import {
  createDashboardApi,
  DEFAULT_PORTFOLIO_ID,
  type PortfolioReadResponseDto,
} from '../lib/portfolio-api';
import { ThemeToggle } from '../theme';
import { EmptyState, getErrorMessage, LoadingState, StatusBanner } from '../ui';

type LoadStatus = 'idle' | 'loading' | 'success' | 'error';

interface PortfolioState {
  data?: PortfolioReadResponseDto;
  error?: string;
  status: LoadStatus;
  isRefreshing: boolean;
}

const api = createDashboardApi();

const initialPortfolioState: PortfolioState = {
  status: 'idle',
  isRefreshing: false,
};

export function DashboardPage() {
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

  const applyPortfolioId = useCallback(() => {
    const nextPortfolioId = portfolioInput.trim();

    if (nextPortfolioId && nextPortfolioId !== portfolioId) {
      setPortfolioId(nextPortfolioId);
    }
  }, [portfolioId, portfolioInput]);

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-normal text-cyan-700 dark:text-cyan-300">
                Trading Bot
              </p>
              <p className="text-lg font-semibold text-zinc-950 dark:text-white">
                Portfolio Dashboard
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
              description="The dashboard could not load this portfolio. Check the portfolio ID or try again."
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
