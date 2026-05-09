import { CheckCircle2, Send } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';

import {
  createDashboardApi,
  type InstrumentDto,
  type RegisterInstrumentRequestDto,
} from '../lib/portfolio-api';
import { getErrorMessage, SectionHeading } from '../ui';

const api = createDashboardApi();

interface RegistrationState {
  error?: string;
  instrument?: InstrumentDto;
  isSubmitting: boolean;
}

const initialRegistrationForm: RegisterInstrumentRequestDto = {
  symbol: '',
  assetClass: 'crypto',
  venue: 'BINANCE',
  externalSymbol: '',
};

const trimRegistrationPayload = (
  form: RegisterInstrumentRequestDto,
): RegisterInstrumentRequestDto => ({
  symbol: form.symbol.trim(),
  assetClass: form.assetClass,
  venue: form.venue.trim().toUpperCase(),
  externalSymbol: form.externalSymbol?.trim() || undefined,
});

export function InstrumentRegistration() {
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
        subtitle="Add tradable markets"
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
