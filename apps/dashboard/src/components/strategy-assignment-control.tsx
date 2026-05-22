import { Link2 } from 'lucide-react';
import { useState } from 'react';

import type { StrategyDto } from '../lib/portfolio-api';
import { getErrorMessage } from '../ui';
import { SectionHeading } from '../ui';

export function StrategyAssignmentControl({
  assignedStrategyId,
  onAssign,
  strategies,
}: {
  assignedStrategyId?: string;
  onAssign: (strategyId: string | null) => Promise<void>;
  portfolioId: string;
  strategies: StrategyDto[];
}) {
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setError(undefined);
    setPending(true);
    try {
      await onAssign(value === '' ? null : value);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <section aria-labelledby="strategy-assign-heading" className="space-y-3">
      <SectionHeading
        Icon={Link2}
        subtitle="Link a strategy to this portfolio"
        title="Strategy Assignment"
      />

      <div className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="space-y-1">
          <label
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            htmlFor="strategy-assign-select"
          >
            Assigned strategy
          </label>
          <select
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            disabled={pending}
            id="strategy-assign-select"
            onChange={(e) => void handleChange(e)}
            value={assignedStrategyId ?? ''}
          >
            <option value="">(none)</option>
            {strategies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {error ? (
            <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
