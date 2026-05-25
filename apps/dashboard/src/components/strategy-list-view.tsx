import { BookOpen, PlusCircle } from 'lucide-react';
import { useState } from 'react';

import type {
  CreateStrategyRequestDto,
  StrategyDto,
} from '../lib/portfolio-api';
import { getErrorMessage } from '../ui';
import { EmptyState, SectionHeading } from '../ui';

const SIDE_BUY = 1;
const SIDE_SELL = 2;

const sideLabel = (side: number): string => {
  if (side === SIDE_BUY) return 'BUY';
  if (side === SIDE_SELL) return 'SELL';
  return String(side);
};

function SidePills({ sides }: { sides: number[] }) {
  return (
    <ul className="mt-1 flex flex-wrap gap-1">
      {sides.map((s) => (
        <li
          key={s}
          className={[
            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
            s === SIDE_BUY
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
              : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
          ].join(' ')}
        >
          {sideLabel(s)}
        </li>
      ))}
    </ul>
  );
}

interface CreateFormState {
  name: string;
  description: string;
  allowedSides: number[];
  minIntervalSecs: string;
  activeTimeStart: string;
  activeTimeEnd: string;
}

const defaultFormState = (): CreateFormState => ({
  name: '',
  description: '',
  allowedSides: [],
  minIntervalSecs: '',
  activeTimeStart: '',
  activeTimeEnd: '',
});

interface CreateStrategyFormProps {
  onCancel: () => void;
  onSubmit: (payload: CreateStrategyRequestDto) => Promise<void>;
}

function CreateStrategyForm({ onCancel, onSubmit }: CreateStrategyFormProps) {
  const [form, setForm] = useState<CreateFormState>(defaultFormState);
  const [nameError, setNameError] = useState<string | undefined>();
  const [sidesError, setSidesError] = useState<string | undefined>();
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

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
    setSubmitError(undefined);

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

    const payload: CreateStrategyRequestDto = {
      name: form.name.trim(),
      allowedSides: form.allowedSides,
    };
    if (form.description.trim()) payload.description = form.description.trim();
    if (form.minIntervalSecs.trim())
      payload.minIntervalSecs = Number(form.minIntervalSecs);
    if (form.activeTimeStart.trim())
      payload.activeTimeStart = form.activeTimeStart.trim();
    if (form.activeTimeEnd.trim())
      payload.activeTimeEnd = form.activeTimeEnd.trim();

    setSubmitting(true);
    try {
      await onSubmit(payload);
    } catch (error) {
      setSubmitError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
        <div className="space-y-1">
          <label
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            htmlFor="strategy-name"
          >
            Strategy name
          </label>
          <input
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            id="strategy-name"
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
            htmlFor="strategy-description"
          >
            Description <span className="text-zinc-400">(optional)</span>
          </label>
          <input
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            id="strategy-description"
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
              htmlFor="strategy-interval"
            >
              Min interval (s) <span className="text-zinc-400">(optional)</span>
            </label>
            <input
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              id="strategy-interval"
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
              htmlFor="strategy-time-start"
            >
              Active from (UTC){' '}
              <span className="text-zinc-400">(optional)</span>
            </label>
            <input
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              id="strategy-time-start"
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
              htmlFor="strategy-time-end"
            >
              Active until (UTC){' '}
              <span className="text-zinc-400">(optional)</span>
            </label>
            <input
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              id="strategy-time-end"
              onChange={(e) =>
                setForm((prev) => ({ ...prev, activeTimeEnd: e.target.value }))
              }
              placeholder="HH:MM"
              type="text"
              value={form.activeTimeEnd}
            />
          </div>
        </div>

        {submitError ? (
          <p className="text-xs text-rose-600 dark:text-rose-400">
            {submitError}
          </p>
        ) : null}

        <div className="flex gap-2">
          <button
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-cyan-600 px-4 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={submitting}
            type="submit"
          >
            Create
          </button>
          <button
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export function StrategyListView({
  onCreate,
  onSelect,
  strategies,
}: {
  onCreate: (payload: CreateStrategyRequestDto) => Promise<void>;
  onSelect: (strategy: StrategyDto) => void;
  strategies: StrategyDto[];
}) {
  const [showForm, setShowForm] = useState(false);

  const handleCreate = async (payload: CreateStrategyRequestDto) => {
    await onCreate(payload);
    setShowForm(false);
  };

  return (
    <section aria-labelledby="strategy-list-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionHeading
          Icon={BookOpen}
          subtitle="Named signal filter profiles"
          title="Strategies"
        />
        {!showForm ? (
          <button
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-cyan-600 px-3 text-sm font-semibold text-white transition hover:bg-cyan-500"
            onClick={() => setShowForm(true)}
            type="button"
          >
            <PlusCircle aria-hidden="true" className="h-4 w-4" />
            New strategy
          </button>
        ) : null}
      </div>

      {showForm ? (
        <CreateStrategyForm
          onCancel={() => setShowForm(false)}
          onSubmit={handleCreate}
        />
      ) : null}

      {strategies.length === 0 && !showForm ? (
        <EmptyState
          description="No strategies have been created yet."
          Icon={BookOpen}
          title="No strategies"
        />
      ) : (
        <ul className="space-y-2">
          {strategies.map((s) => (
            <li key={s.id}>
              <button
                aria-label={s.name}
                className="w-full rounded-md border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-cyan-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-cyan-700"
                onClick={() => onSelect(s)}
                type="button"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {s.name}
                  </span>
                  <SidePills sides={s.allowedSides} />
                </div>
                {s.description ? (
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {s.description}
                  </p>
                ) : null}
                {s.minIntervalSecs != null ||
                s.activeTimeStart ||
                s.activeTimeEnd ? (
                  <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                    {s.minIntervalSecs != null
                      ? `Min interval: ${s.minIntervalSecs}s`
                      : ''}
                    {s.activeTimeStart && s.activeTimeEnd
                      ? ` · Active: ${s.activeTimeStart}–${s.activeTimeEnd} UTC`
                      : ''}
                  </p>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
