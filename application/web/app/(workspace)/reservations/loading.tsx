import s from "../../reservations/workspace.module.css";
export default function Loading() {
  return (
    <main className={s.workspace}>
      <div className={s.eyebrow}>BUSINESS / RESERVATIONS</div>
      <h1>Reservations</h1>
      <div className={s.metrics}>
        {Array.from({ length: 6 }, (_, i) => (
          <div className={s.metric} key={i}>
            Loading…
          </div>
        ))}
      </div>
      <section className={s.panel}>
        <div className={s.skeleton} />
      </section>
    </main>
  );
}
