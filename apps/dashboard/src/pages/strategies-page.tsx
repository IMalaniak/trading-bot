import { AlertTriangle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { StrategyDetailView } from '../components/strategy-detail-view';
import { StrategyListView } from '../components/strategy-list-view';
import {
  createDashboardApi,
  type CreateStrategyRequestDto,
  type StrategyDto,
  type UpdateStrategyRequestDto,
} from '../lib/portfolio-api';
import { ThemeToggle } from '../theme';
import { EmptyState, getErrorMessage, LoadingState } from '../ui';

type LoadStatus = 'idle' | 'loading' | 'success' | 'error';

interface StrategiesState {
  strategies: StrategyDto[];
  status: LoadStatus;
  error?: string;
}

const api = createDashboardApi();

export function StrategiesPage() {
  const [state, setState] = useState<StrategiesState>({
    strategies: [],
    status: 'idle',
  });
  const [selectedStrategy, setSelectedStrategy] = useState<
    StrategyDto | undefined
  >();

  const loadStrategies = useCallback(async () => {
    setState((current) => ({
      ...current,
      status: current.strategies.length > 0 ? 'success' : 'loading',
      error: undefined,
    }));
    try {
      const response = await api.listStrategies();
      setState({ strategies: response.strategies, status: 'success' });
    } catch (error) {
      setState((current) => ({
        ...current,
        status: 'error',
        error: getErrorMessage(error),
      }));
    }
  }, []);

  useEffect(() => {
    void loadStrategies();
  }, [loadStrategies]);

  const handleCreate = async (payload: CreateStrategyRequestDto) => {
    const created = await api.createStrategy(payload);
    setState((current) => ({
      ...current,
      strategies: [created, ...current.strategies],
    }));
  };

  const handleUpdate = async (payload: UpdateStrategyRequestDto) => {
    if (!selectedStrategy) return;
    const updated = await api.updateStrategy(selectedStrategy.id, payload);
    setState((current) => ({
      ...current,
      strategies: current.strategies.map((s) =>
        s.id === updated.id ? updated : s,
      ),
    }));
    setSelectedStrategy(updated);
  };

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-cyan-700 dark:text-cyan-300">
              Trading Bot
            </p>
            <p className="text-lg font-semibold text-zinc-950 dark:text-white">
              Strategies
            </p>
          </div>
          <ThemeToggle />
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-8">
        <div>
          {state.status === 'loading' ? (
            <LoadingState />
          ) : state.status === 'error' ? (
            <EmptyState
              description={
                state.error ?? 'The dashboard could not load strategies.'
              }
              Icon={AlertTriangle}
              title="Strategies unavailable"
            />
          ) : (
            <StrategyListView
              onCreate={handleCreate}
              onSelect={(s) => setSelectedStrategy(s)}
              strategies={state.strategies}
            />
          )}
        </div>

        {selectedStrategy ? (
          <aside>
            <StrategyDetailView
              onUpdate={handleUpdate}
              strategy={selectedStrategy}
            />
          </aside>
        ) : null}
      </div>
    </main>
  );
}
