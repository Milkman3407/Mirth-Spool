export default function FeedPlaceholderPage() {
  return (
    <>
      <p className="eyebrow">Authenticated application shell</p>
      <h1>Your future feed starts here.</h1>
      <p className="lede">
        MirthSpool is secured and ready. Official-source ingestion and feed
        content intentionally arrive in later milestones.
      </p>
      <section className="panel" aria-labelledby="feed-placeholder-title">
        <h2 id="feed-placeholder-title">Feed placeholder</h2>
        <p>No sources are connected, and manual uploads are not supported.</p>
      </section>
    </>
  );
}
