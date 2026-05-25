import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  exposureUsagePercent,
  formatDateTime,
  formatDecimal,
  formatNotional,
} from '../lib/formatters';
import {
  createDashboardApi,
  type PortfolioSummaryDto,
} from '../lib/portfolio-api';
import { ThemeToggle } from '../theme';
import { EmptyState, getErrorMessage, LoadingState } from '../ui';

type LoadStatus = 'idle' | 'loading' | 'success' | 'error';

interface PortfolioListState {
  error?: string;
  portfolios: PortfolioSummaryDto[];
  status: LoadStatus;
}

const api = createDashboardApi();

export function PortfolioListPage() {
  const [state, setState] = useState<PortfolioListState>({
    portfolios: [],
    status: 'idle',
  });

  useEffect(() => {
    let isMounted = true;

    const loadPortfolios = async () => {
      setState({ portfolios: [], status: 'loading' });

      try {
        const response = await api.listPortfolios();

        if (isMounted) {
          setState({ portfolios: response.portfolios, status: 'success' });
        }
      } catch (error) {
        if (isMounted) {
          setState({
            portfolios: [],
            status: 'error',
            error: getErrorMessage(error),
          });
        }
      }
    };

    void loadPortfolios();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-cyan-700 dark:text-cyan-300">
              Trading Bot
            </p>
            <p className="text-lg font-semibold text-zinc-950 dark:text-white">
              Portfolios
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              to="/strategies"
            >
              <BookOpen aria-hidden="true" className="h-4 w-4" />
              Strategies
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        {state.status === 'loading' ? (
          <LoadingState />
        ) : state.status === 'error' ? (
          <EmptyState
            Icon={AlertTriangle}
            title="Portfolios unavailable"
            description={
              state.error ?? 'The dashboard could not load portfolios.'
            }
          />
        ) : state.portfolios.length === 0 ? (
          <EmptyState
            Icon={BriefcaseBusiness}
            title="No portfolios"
            description="Create a portfolio in the backend to start monitoring it here."
          />
        ) : (
          <section
            aria-labelledby="portfolio-list-heading"
            className="space-y-4"
          >
            <div>
              <h1
                className="text-2xl font-semibold tracking-normal text-zinc-950 dark:text-white"
                id="portfolio-list-heading"
              >
                Select Portfolio
              </h1>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Choose a portfolio to inspect positions, orders, and
                instruments.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {state.portfolios.map((portfolio) => (
                <PortfolioCard
                  key={portfolio.portfolioId}
                  portfolio={portfolio}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function PortfolioCard({ portfolio }: { portfolio: PortfolioSummaryDto }) {
  const exposurePercent = exposureUsagePercent(
    portfolio.aggregateExposureNotional,
    portfolio.exposureCapNotional,
  );

  return (
    <Link
      className="group rounded-md border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50/40 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-cyan-900 dark:hover:bg-cyan-950/30"
      to={`/portfolios/${encodeURIComponent(portfolio.portfolioId)}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-cyan-700 dark:text-cyan-300">
            {portfolio.portfolioId}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-950 dark:text-white">
            {portfolio.name}
          </h2>
        </div>
        <ArrowRight
          aria-hidden="true"
          className="h-5 w-5 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-cyan-600 dark:text-zinc-500 dark:group-hover:text-cyan-300"
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs uppercase tracking-normal text-zinc-500 dark:text-zinc-400">
            Exposure
          </p>
          <p className="mt-1 font-medium text-zinc-950 dark:text-white">
            {formatNotional(portfolio.aggregateExposureNotional)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-normal text-zinc-500 dark:text-zinc-400">
            Positions
          </p>
          <p className="mt-1 font-medium text-zinc-950 dark:text-white">
            {portfolio.openPositionCount}
          </p>
        </div>
      </div>
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">Cap usage</span>
          <span className="font-medium text-zinc-950 dark:text-white">
            {formatDecimal(exposurePercent, 1)}%
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
          <div
            aria-label={`${portfolio.name} exposure usage`}
            className="h-full rounded bg-cyan-500"
            style={{ width: `${exposurePercent}%` }}
          />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
        <span
          className={`rounded-md px-2 py-1 text-xs font-medium ${
            portfolio.isActive
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
              : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300'
          }`}
        >
          {portfolio.isActive ? 'Active' : 'Inactive'}
        </span>
        <span className="text-zinc-500 dark:text-zinc-400">
          {formatDateTime(portfolio.updatedAt)}
        </span>
      </div>
    </Link>
  );
}
