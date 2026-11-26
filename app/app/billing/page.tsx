/** Placeholder until Stripe billing lands (Phase 1b). */
export default function BillingPage() {
  return (
    <div className="page selectable">
      <div className="bar"><div className="brand"><img className="logo" src="/logo.png" alt="" /><span className="brand-sub">Billing</span></div><div className="right"><a className="tbtn" href="/app">Back to events</a></div></div>
      <div className="empty"><h3>Plans are almost ready</h3><p>Starter, Studio and White Label monthly plans are being wired up with Stripe. Your trial keeps everything unlocked in the meantime.</p></div>
    </div>
  );
}
