import { DECIMAL_STRING_PATTERN } from '@trading-bot/common/validation';
import { CheckCircle2, ChevronDown, Send } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';

import {
  type AssetClassName,
  createDashboardApi,
  type PortfolioInstrumentConfigDto,
  type RegisterPortfolioInstrumentRequestDto,
} from '../lib/portfolio-api';
import { getErrorMessage, SectionHeading } from '../ui';

const api = createDashboardApi();

interface RegistrationState {
  error?: string;
  configuredInstrument?: PortfolioInstrumentConfigDto;
  isSubmitting: boolean;
}

interface RegistrationForm {
  symbol: string;
  assetClass: AssetClassName | '';
  venue: string;
  externalSymbol: string;
  enabled: boolean;
  targetNotional: string;
  maxTradeNotional: string;
  maxPositionNotional: string;
}

const initialRegistrationForm: RegistrationForm = {
  symbol: '',
  assetClass: '',
  venue: '',
  externalSymbol: '',
  enabled: true,
  targetNotional: '',
  maxTradeNotional: '',
  maxPositionNotional: '',
};

const trimRegistrationPayload = (
  form: RegistrationForm,
): RegisterPortfolioInstrumentRequestDto | undefined => {
  const assetClass = form.assetClass;

  if (!assetClass) {
    return undefined;
  }

  return {
    symbol: form.symbol.trim(),
    assetClass,
    venue: form.venue.trim().toUpperCase(),
    externalSymbol: form.externalSymbol.trim() || undefined,
    enabled: form.enabled,
    targetNotional: form.targetNotional.trim(),
    maxTradeNotional: form.maxTradeNotional.trim(),
    maxPositionNotional: form.maxPositionNotional.trim(),
  };
};

export function InstrumentRegistration({
  onRegistered,
  portfolioId,
}: {
  onRegistered: (configuredInstrument: PortfolioInstrumentConfigDto) => void;
  portfolioId: string;
}) {
  const [form, setForm] = useState<RegistrationForm>(initialRegistrationForm);
  const [state, setState] = useState<RegistrationState>({
    isSubmitting: false,
  });

  const payload = useMemo(() => trimRegistrationPayload(form), [form]);
  const isValid =
    payload !== undefined &&
    payload.symbol.length > 0 &&
    payload.venue.length > 0 &&
    DECIMAL_STRING_PATTERN.test(payload.targetNotional) &&
    DECIMAL_STRING_PATTERN.test(payload.maxTradeNotional) &&
    DECIMAL_STRING_PATTERN.test(payload.maxPositionNotional);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isValid || !payload) {
      setState({
        isSubmitting: false,
        error: 'Instrument, venue, asset class, and risk limits are required.',
      });
      return;
    }

    setState({ isSubmitting: true });

    try {
      const configuredInstrument = await api.registerPortfolioInstrument(
        portfolioId,
        payload,
      );
      setState({ isSubmitting: false, configuredInstrument });
      setForm(initialRegistrationForm);
      onRegistered(configuredInstrument);
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
        subtitle="Configure a market for this portfolio"
        title="Add Instrument"
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
            placeholder="AAPL"
            value={form.symbol}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-200">
            Asset class
            <span className="relative mt-1 block">
              <select
                className="h-10 w-full appearance-none rounded-md border border-zinc-300 bg-white px-3 pr-9 text-zinc-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    assetClass: event.target
                      .value as RegistrationForm['assetClass'],
                  }))
                }
                value={form.assetClass}
              >
                <option value="">Select</option>
                <option value="crypto">Crypto</option>
                <option value="stock">Stock</option>
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
              />
            </span>
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
              placeholder="NASDAQ"
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
            placeholder="AAPL"
            value={form.externalSymbol}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <NotionalInput
            label="Target notional"
            onChange={(value) =>
              setForm((current) => ({ ...current, targetNotional: value }))
            }
            value={form.targetNotional}
          />
          <NotionalInput
            label="Max trade"
            onChange={(value) =>
              setForm((current) => ({ ...current, maxTradeNotional: value }))
            }
            value={form.maxTradeNotional}
          />
          <NotionalInput
            label="Max position"
            onChange={(value) =>
              setForm((current) => ({ ...current, maxPositionNotional: value }))
            }
            value={form.maxPositionNotional}
          />
        </div>
        <label className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
          Enabled
          <input
            checked={form.enabled}
            className="h-4 w-4 rounded border-zinc-300 text-cyan-600 focus:ring-cyan-500"
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                enabled: event.target.checked,
              }))
            }
            type="checkbox"
          />
        </label>

        {state.error ? (
          <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
            {state.error}
          </p>
        ) : null}
        {state.configuredInstrument ? (
          <p className="flex items-center gap-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
            Added {state.configuredInstrument.instrument.symbol} to portfolio.
          </p>
        ) : null}

        <button
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          disabled={!isValid || state.isSubmitting}
          type="submit"
        >
          <Send aria-hidden="true" className="h-4 w-4" />
          {state.isSubmitting ? 'Adding...' : 'Add to Portfolio'}
        </button>
      </form>
    </section>
  );
}

function NotionalInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-200">
      {label}
      <input
        className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-zinc-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
        inputMode="decimal"
        onChange={(event) => onChange(event.target.value)}
        placeholder="100"
        value={value}
      />
    </label>
  );
}
