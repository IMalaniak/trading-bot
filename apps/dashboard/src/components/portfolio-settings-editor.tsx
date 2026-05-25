import { Settings } from 'lucide-react';
import { useState } from 'react';

import type {
  PortfolioSummaryDto,
  UpdatePortfolioRequestDto,
} from '../lib/portfolio-api';
import { getErrorMessage } from '../ui';
import { SectionHeading } from '../ui';

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function PortfolioSettingsEditor({
  portfolio,
  onSubmit,
}: {
  portfolio: PortfolioSummaryDto;
  onSubmit: (values: UpdatePortfolioRequestDto) => Promise<void>;
}) {
  const [exposureCap, setExposureCap] = useState(portfolio.exposureCapNotional);
  const [isActive, setIsActive] = useState(portfolio.isActive);
  const [validationError, setValidationError] = useState<string | undefined>();
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!DECIMAL_PATTERN.test(exposureCap)) {
      setValidationError('Must be a valid decimal number (e.g. 1000.00)');
      return;
    }

    setValidationError(undefined);
    setStatus('saving');
    setErrorMessage(undefined);

    try {
      await onSubmit({ exposureCapNotional: exposureCap, isActive });
      setStatus('saved');
    } catch (error) {
      setStatus('error');
      setErrorMessage(getErrorMessage(error));
    }
  };

  return (
    <section aria-labelledby="portfolio-settings-heading" className="space-y-3">
      <SectionHeading
        Icon={Settings}
        subtitle="Exposure limits and portfolio activation"
        title="Portfolio Settings"
      />

      <div className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
          <div className="space-y-1">
            <label
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              htmlFor="exposure-cap"
            >
              Exposure cap (notional)
            </label>
            <input
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              id="exposure-cap"
              onChange={(e) => setExposureCap(e.target.value)}
              type="text"
              value={exposureCap}
            />
            {validationError ? (
              <p className="text-xs text-rose-600 dark:text-rose-400">
                {validationError}
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <input
              checked={isActive}
              className="h-4 w-4 rounded border-zinc-300 text-cyan-600 focus:ring-cyan-500"
              id="is-active"
              onChange={(e) => setIsActive(e.target.checked)}
              type="checkbox"
            />
            <label
              className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
              htmlFor="is-active"
            >
              Active
            </label>
          </div>

          {errorMessage ? (
            <p className="text-sm text-rose-600 dark:text-rose-400">
              {errorMessage}
            </p>
          ) : null}

          {status === 'saved' ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              Saved successfully.
            </p>
          ) : null}

          <button
            className="inline-flex h-9 items-center gap-2 rounded-md bg-cyan-600 px-4 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={status === 'saving'}
            type="submit"
          >
            {status === 'saving' ? 'Saving…' : 'Save settings'}
          </button>
        </form>
      </div>
    </section>
  );
}
