import { ShieldAlert } from 'lucide-react';

import type { RiskDecisionDto } from '../lib/portfolio-api';
import { EmptyState, SectionHeading } from '../ui';

function DecisionBadge({ decision }: { decision: string }) {
  const isApproved = decision === 'APPROVED';
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
        isApproved
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
          : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
      ].join(' ')}
    >
      {decision}
    </span>
  );
}

function ReasonPills({ codes }: { codes: string[] }) {
  if (codes.length === 0) return null;
  return (
    <ul className="mt-1 flex flex-wrap gap-1">
      {codes.map((code) => (
        <li
          key={code}
          className="inline-flex items-center rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
        >
          {code}
        </li>
      ))}
    </ul>
  );
}

export function RiskDecisionHistoryView({
  decisions,
}: {
  decisions: RiskDecisionDto[];
}) {
  return (
    <section aria-labelledby="risk-decisions-heading" className="space-y-3">
      <SectionHeading
        Icon={ShieldAlert}
        subtitle="Recent risk engine verdicts"
        title="Risk Decisions"
      />

      {decisions.length === 0 ? (
        <EmptyState
          description="No risk decisions have been recorded yet."
          Icon={ShieldAlert}
          title="No risk decisions"
        />
      ) : (
        <>
          {/* Mobile card list */}
          <ul className="space-y-2 md:hidden">
            {decisions.map((d) => (
              <li
                key={d.id}
                className="rounded-md border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {d.instrumentId}
                  </span>
                  <DecisionBadge decision={d.decision} />
                </div>
                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Notional: {d.requestedNotional} · Price: {d.referencePrice}
                </div>
                <ReasonPills codes={d.reasonCodes} />
                <div className="mt-1 text-xs text-zinc-400">
                  {new Date(d.decidedAt).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-md border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950 md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                <tr>
                  {[
                    'Instrument',
                    'Decision',
                    'Notional',
                    'Price',
                    'Reasons',
                    'Time',
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {decisions.map((d) => (
                  <tr
                    key={d.id}
                    className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <td className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                      {d.instrumentId}
                    </td>
                    <td className="px-4 py-2">
                      <DecisionBadge decision={d.decision} />
                    </td>
                    <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                      {d.requestedNotional}
                    </td>
                    <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                      {d.referencePrice}
                    </td>
                    <td className="px-4 py-2">
                      <ReasonPills codes={d.reasonCodes} />
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-400">
                      {new Date(d.decidedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
