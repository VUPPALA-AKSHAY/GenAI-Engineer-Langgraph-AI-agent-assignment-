"use client";

// Live quality scorecard and retry history.
import type { CheckRow, RejectionRow } from "@/lib/types";

const PASS_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="13" height="13">
    <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const FAIL_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="13" height="13">
    <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
  </svg>
);

export function RubricChecklist({
  checks,
  running,
}: {
  checks: CheckRow[];
  running: boolean;
}) {
  if (!checks.length && !running) return null;

  const passed = checks.filter((c) => c.pass).length;

  return (
    <div className="rubric">
      <div className="rubric-head">
        <span className="rubric-title">Rubric — 6 hard checks (no partial credit)</span>
        {checks.length > 0 && (
          <span className={`rubric-score ${passed === checks.length ? "is-ok" : "is-bad"}`}>
            {passed} / {checks.length} pass
          </span>
        )}
      </div>

      <ul className="rubric-list">
        {checks.map((check) => (
          <li key={check.id} className={`rubric-row ${check.pass ? "is-pass" : "is-fail"}`}>
            <span className={`rubric-chip ${check.pass ? "is-pass" : "is-fail"}`}>
              {check.pass ? PASS_ICON : FAIL_ICON}
              {check.pass ? "PASS" : "FAIL"}
            </span>
            <span className="rubric-body">
              <span className="rubric-name">
                {check.title || check.id}
                {check.layer && <em className="rubric-layer">AI judge</em>}
              </span>
              <span className="rubric-reason">{check.reason}</span>
            </span>
          </li>
        ))}
        {running &&
          checks.length < 6 &&
          Array.from({ length: 6 - checks.length }).map((_, index) => (
            <li key={`pending-${index}`} className="rubric-row is-pending">
              <span className="rubric-chip is-pending">…</span>
              <span className="rubric-body">
                <span className="rubric-name shimmer">waiting for judge</span>
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}

export function RejectionLog({ rows }: { rows: RejectionRow[] }) {
  const meaningful = rows.filter(
    (row) => row.status === "rejected" || (row.failed_checks && row.failed_checks.length > 0),
  );
  if (!rows.length) return null;

  return (
    <div className="rejection-log">
      <div className="rejection-head">
        <span className="rejection-title">Rejection log</span>
        <span className="rejection-sub">
          {meaningful.length
            ? `${meaningful.length} rejected attempt(s) recorded`
            : "First attempt passed — nothing had to be fixed"}
        </span>
      </div>

      {meaningful.length === 0 ? (
        <p className="rejection-empty">
          Attempt 1 passed all 6 checks, so the loop shipped immediately. The log stays empty on
          purpose — it only records what was rejected and what changed.
        </p>
      ) : (
        <div className="rejection-table-wrap">
          <table className="rejection-table">
            <thead>
              <tr>
                <th>Attempt</th>
                <th>Check that failed</th>
                <th>Why</th>
                <th>Fix instructed for retry</th>
              </tr>
            </thead>
            <tbody>
              {meaningful.map((row) =>
                row.failed_checks.length ? (
                  row.failed_checks.map((check, index) => (
                    <tr key={`${row.attempt}-${check.id}-${index}`}>
                      <td>{index === 0 ? `#${row.attempt}` : ""}</td>
                      <td>
                        <span className="fail-tag">{check.title || check.id}</span>
                      </td>
                      <td>{check.reason}</td>
                      <td>{row.fixes_applied?.[check.id] || "Rewrote that part to pass the check."}</td>
                    </tr>
                  ))
                ) : (
                  <tr key={`row-${row.attempt}`}>
                    <td>#{row.attempt}</td>
                    <td colSpan={3}>No failures on this attempt.</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
