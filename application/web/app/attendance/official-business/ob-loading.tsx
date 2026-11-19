import { LoadingFields, LoadingLines, LoadingList, LoadingRegion } from "../../components/content-loading";
import { Skeleton } from "../../components/loading-ui";
import css from "./ob.module.css";

export function ObCardsLoading() {
  return <LoadingRegion label="Loading Official Business requests"><div className={css.cards} aria-hidden="true">{[0, 1, 2].map(i => <article className={css.card} key={i}><div className={css.cardTop}><Skeleton className="loading-caption" /><Skeleton className="loading-pill" /></div><Skeleton className="loading-section-title" /><LoadingLines lines={3} /><div className={css.cardAction}><Skeleton className="loading-caption" /></div></article>)}</div></LoadingRegion>;
}
export function ObPageLoading() {
  return <div><div className={css.entryHeader}><h1>Official Business</h1></div><section className={css.panel}><div className={css.filters} aria-hidden="true">{[0,1,2,3].map(i => <Skeleton className="loading-filter" key={i} />)}</div><ObCardsLoading /></section></div>;
}
export function ObDetailLoading() {
  return <div className={css.drawerBody}><div className={css.identity}><LoadingLines /><Skeleton className="loading-pill" /></div><LoadingFields label="Loading Official Business details" labels={["Work date", "Estimated interval", "Destination", "Purpose"]} className={css.facts} /><LoadingList label="Loading request history" items={2} /></div>;
}
