import { ClipboardList } from 'lucide-react';

import type { RiskConfigAuditLogEntryDto } from '../lib/portfolio-api';
import { EmptyState, SectionHeading } from '../ui';

export function RiskConfigAuditLogView({
  entries,
}: {
  entries: RiskConfigAuditLogEntryDto[];
}) {
  return (
    <section aria-labelledby="audit-log-heading" className="space-y-3">
      <SectionHeading
        Icon={ClipboardList}
        subtitle="Configuration changes over time"
        title="Config Change Log"
      />

      {entries.length === 0 ? (
        <EmptyState
          description="No configuration changes have been recorded yet."
          Icon={ClipboardList}
          title="No audit log entries"
        />
      ) : (
        <>
          {/* Mobile card list */}
          <ul className="space-y-2 md:hidden">
            {entries.map((e) => (
              <li
                key={e.id}
                className="rounded-md border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-zinc-500 uppercase dark:text-zinc-400">
                    {e.entityType}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {new Date(e.changedAt).toLocaleString()}
                  </span>
                </div>
                <div className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {e.field}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <span className="rounded bg-rose-100 px-1.5 py-0.5 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                    {e.oldValue ?? '—'}
                  </span>
                  <span className="text-zinc-400">→</span>
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                    {e.newValue ?? '—'}
                  </span>
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
                    'Entity',
                    'Field',
                    'Old value',
                    'New value',
                    'Changed at',
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
                {entries.map((e) => (
                  <tr
                    key={e.id}
                    className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <td className="px-4 py-2 text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
                      {e.entityType}
                    </td>
                    <td className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                      {e.field}
                    </td>
                    <td className="px-4 py-2">
                      <span className="rounded bg-rose-100 px-1.5 py-0.5 text-xs text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                        {e.oldValue ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                        {e.newValue ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-400">
                      {new Date(e.changedAt).toLocaleString()}
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
