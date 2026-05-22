import { BookOpen } from 'lucide-react';
import { useState } from 'react';

import type {
  StrategyDto,
  UpdateStrategyRequestDto,
} from '../lib/portfolio-api';
import { getErrorMessage } from '../ui';
import { SectionHeading } from '../ui';

const SIDE_BUY = 1;
const SIDE_SELL = 2;

interface EditFormState {
  name: string;
  description: string;
  allowedSides: number[];
  minIntervalSecs: string;
  activeTimeStart: string;
  activeTimeEnd: string;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function StrategyDetailView({
  onUpdate,
  strategy,
}: {
  onUpdate: (payload: UpdateStrategyRequestDto) => Promise<void>;
  strategy: StrategyDto;
}) {
  const [form, setForm] = useState<EditFormState>({
    name: strategy.name,
    description: strategy.description ?? '',
    allowedSides: [...strategy.allowedSides],
    minIntervalSecs:
      strategy.minIntervalSecs != null ? String(strategy.minIntervalSecs) : '',
    activeTimeStart: strategy.activeTimeStart ?? '',
    activeTimeEnd: strategy.activeTimeEnd ?? '',
  });
  const [nameError, setNameError] = useState<string | undefined>();
  const [sidesError, setSidesError] = useState<string | undefined>();
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const toggleSide = (side: number) => {
    setForm((prev) => ({
      ...prev,
      allowedSides: prev.allowedSides.includes(side)
        ? prev.allowedSides.filter((s) => s !== side)
        : [...prev.allowedSides, side].sort(),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameError(undefined);
    setSidesError(undefined);
    setErrorMessage(undefined);

    let hasError = false;
    if (!form.name.trim()) {
      setNameError('Name is required');
      hasError = true;
    }
    if (form.allowedSides.length === 0) {
      setSidesError('Select at least one allowed side');
      hasError = true;
    }
    if (hasError) return;

    const payload: UpdateStrategyRequestDto = {
      name: form.name.trim(),
      allowedSides: form.allowedSides,
    };
    payload.description = form.description.trim() || undefined;
    payload.minIntervalSecs = form.minIntervalSecs.trim()
      ? Number(form.minIntervalSecs)
      : undefined;
    payload.activeTimeStart = form.activeTimeStart.trim() || undefined;
    payload.activeTimeEnd = form.activeTimeEnd.trim() || undefined;

    setStatus('saving');
    try {
      await onUpdate(payload);
      setStatus('saved');
    } catch (error) {
      setStatus('error');
      setErrorMessage(getErrorMessage(error));
    }
  };

  return (
    <section aria-labelledby="strategy-detail-heading" className="space-y-3">
      <SectionHeading
        Icon={BookOpen}
        subtitle="Edit strategy signal filter settings"
        title="Strategy Details"
      />

      <div className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
          <div className="space-y-1">
            <label
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              htmlFor="edit-strategy-name"
            >
              Strategy name
            </label>
            <input
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              id="edit-strategy-name"
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              type="text"
              value={form.name}
            />
            {nameError ? (
              <p className="text-xs text-rose-600 dark:text-rose-400">
                {nameError}
              </p>
            ) : null}
          </div>

          <div className="space-y-1">
            <label
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              htmlFor="edit-strategy-description"
            >
              Description <span className="text-zinc-400">(optional)</span>
            </label>
            <input
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              id="edit-strategy-description"
              onChange={(e) =>
                setForm((prev) => ({ ...prev, description: e.target.value }))
              }
              type="text"
              value={form.description}
            />
          </div>

          <fieldset className="space-y-1">
            <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Allowed sides
            </legend>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  aria-label="BUY"
                  checked={form.allowedSides.includes(SIDE_BUY)}
                  className="h-4 w-4 rounded border-zinc-300 text-cyan-600 focus:ring-cyan-500"
                  onChange={() => toggleSide(SIDE_BUY)}
                  type="checkbox"
                />
                BUY
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  aria-label="SELL"
                  checked={form.allowedSides.includes(SIDE_SELL)}
                  className="h-4 w-4 rounded border-zinc-300 text-cyan-600 focus:ring-cyan-500"
                  onChange={() => toggleSide(SIDE_SELL)}
                  type="checkbox"
                />
                SELL
              </label>
            </div>
            {sidesError ? (
              <p className="text-xs text-rose-600 dark:text-rose-400">
                {sidesError}
              </p>
            ) : null}
          </fieldset>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                htmlFor="edit-strategy-interval"
              >
                Min interval (s){' '}
                <span className="text-zinc-400">(optional)</span>
              </label>
              <input
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                id="edit-strategy-interval"
                min="0"
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    minIntervalSecs: e.target.value,
                  }))
                }
                type="number"
                value={form.minIntervalSecs}
              />
            </div>

            <div className="space-y-1">
              <label
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                htmlFor="edit-strategy-time-start"
              >
                Active from (UTC){' '}
                <span className="text-zinc-400">(optional)</span>
              </label>
              <input
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                id="edit-strategy-time-start"
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    activeTimeStart: e.target.value,
                  }))
                }
                placeholder="HH:MM"
                type="text"
                value={form.activeTimeStart}
              />
            </div>

            <div className="space-y-1">
              <label
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                htmlFor="edit-strategy-time-end"
              >
                Active until (UTC){' '}
                <span className="text-zinc-400">(optional)</span>
              </label>
              <input
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                id="edit-strategy-time-end"
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    activeTimeEnd: e.target.value,
                  }))
                }
                placeholder="HH:MM"
                type="text"
                value={form.activeTimeEnd}
              />
            </div>
          </div>

          {errorMessage ? (
            <p className="text-xs text-rose-600 dark:text-rose-400">
              {errorMessage}
            </p>
          ) : null}

          {status === 'saved' ? (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Strategy saved.
            </p>
          ) : null}

          <button
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-cyan-600 px-4 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={status === 'saving'}
            type="submit"
          >
            Save
          </button>
        </form>
      </div>
    </section>
  );
}
