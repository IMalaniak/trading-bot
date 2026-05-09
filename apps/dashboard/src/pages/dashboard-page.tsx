import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { InstrumentRegistration } from '../components/instrument-registration';
import { PortfolioInstrumentsView } from '../components/portfolio-instruments-view';
import { PortfolioSummary } from '../components/portfolio-summary';
import { PositionsView } from '../components/positions-view';
import { RecentOrdersView } from '../components/recent-orders-view';
import {
  createDashboardApi,
  type PortfolioInstrumentConfigDto,
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
  const { portfolioId = '' } = useParams<{ portfolioId: string }>();
  const [state, setState] = useState<PortfolioState>(initialPortfolioState);

  const loadPortfolio = useCallback(
    async (keepData = false) => {
      if (!portfolioId) {
        setState({
          status: 'error',
          isRefreshing: false,
          error: 'Select a portfolio to view details.',
        });
        return;
      }

      setState((current) => ({
        data: keepData ? current.data : undefined,
        error: undefined,
        status: keepData && current.data ? 'success' : 'loading',
        isRefreshing: keepData && Boolean(current.data),
      }));

      try {
        const data = await api.getPortfolio(portfolioId);
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
    [portfolioId],
  );

  useEffect(() => {
    void loadPortfolio();
  }, [loadPortfolio]);

  const handleInstrumentRegistered = useCallback(
    (configuredInstrument: PortfolioInstrumentConfigDto) => {
      setState((current) => {
        if (!current.data) {
          return current;
        }

        const withoutExisting = current.data.configuredInstruments.filter(
          (config) =>
            config.instrument.id !== configuredInstrument.instrument.id,
        );

        return {
          ...current,
          data: {
            ...current.data,
            configuredInstruments: [configuredInstrument, ...withoutExisting],
          },
        };
      });
    },
    [],
  );

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
          <div className="flex items-center justify-between gap-2">
            <Link
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              to="/"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              Portfolios
            </Link>
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-cyan-600 px-4 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={state.status === 'loading' || state.isRefreshing}
              onClick={() => void loadPortfolio(true)}
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

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
        <div className="space-y-5">
          <StatusBanner error={state.error} isRefreshing={state.isRefreshing} />

          {state.status === 'loading' ? (
            <LoadingState />
          ) : state.data ? (
            <>
              <PortfolioSummary data={state.data} />
              <PortfolioInstrumentsView
                instruments={state.data.configuredInstruments}
              />
              <PositionsView positions={state.data.positions} />
              <RecentOrdersView orders={state.data.recentOrders} />
            </>
          ) : state.status === 'error' ? (
            <EmptyState
              Icon={AlertTriangle}
              title="Portfolio unavailable"
              description="The dashboard could not load this portfolio. Check the selected portfolio or try again."
            />
          ) : null}
        </div>
        <aside className="space-y-5">
          <InstrumentRegistration
            onRegistered={handleInstrumentRegistered}
            portfolioId={portfolioId}
          />
        </aside>
      </div>
    </main>
  );
}
