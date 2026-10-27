import Link from "next/link";

export default function Home() {
  return (
    <main className="wrap" style={{ maxWidth: 560, margin: "60px auto" }}>
      <img src="/logo.png" alt="Photo Lounge by Redefined Weddings" style={{ height: 34 }} />
      <h1 style={{ fontSize: 36, marginTop: 20 }}>Signature Book</h1>
      <p style={{ color: "var(--fg2)" }}>
        Each event has its own link. Open <code>/your-event-slug</code> on the iPad,{" "}
        <code>/your-event-slug/upload</code> on the editing laptop, and send the couple{" "}
        <code>/your-event-slug/gallery?key=…</code>.
      </p>
      <p>
        <Link href="/demo" className="tbtn">Open the demo event</Link>
      </p>
    </main>
  );
}
