export default function Loading() {
  return (
    <main className="module-access-page" aria-busy="true">
      <div className="module-access-heading">
        <div className="module-access-skeleton title" />
        <div className="module-access-skeleton copy" />
      </div>
      <div className="module-access-layout">
        <aside className="module-access-panel">
          <div className="module-access-skeleton control" />
          <div className="module-access-skeleton control" />
          <div className="module-access-skeleton list" />
        </aside>
        <section className="module-access-panel">
          <div className="module-access-skeleton control" />
          <div className="module-access-skeleton list" />
        </section>
      </div>
    </main>
  );
}
