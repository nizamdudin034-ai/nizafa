// Small shared UI pieces: stat cards, badges, copy button, empty states.
// Keep classNames in sync with globals.css.
export function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="card">
      <div className="stat-label">{label}</div>
      <div className="stat-num">{value}</div>
      {sub ? <div className="small muted">{sub}</div> : null}
    </div>
  );
}

export function SectionTitle({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        <h2 style={{ marginBottom: 2 }}>{title}</h2>
        {sub ? <div className="small muted">{sub}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card" style={{ textAlign: "center", padding: "28px 18px" }}>
      <h3>{title}</h3>
      <p className="muted">{body}</p>
      {action}
    </div>
  );
}
