import Image from "next/image";
import { ArrowDown, CalendarDays, CheckCircle2, MapPin } from "lucide-react";
import { SpaceSearch } from "@/components/booking/search";
export default function Home() {
  return (
    <div className="landing">
      <section className="hero">
        <div className="hero-copy">
          <h1>
            Good work starts
            <br />
            with the <em>right space.</em>
          </h1>
          <p className="intro">
            A focused morning. A meeting that moves things forward.
            <br className="desktop" /> Find your place at MSPACES.
          </p>
          <a href="#spaces" className="button">
            Find your space <ArrowDown size={18} aria-hidden="true" />
          </a>
        </div>
        <div className="hero-art">
          <Image
            src="/login-image/login-image-2.jpg"
            alt="Workspace with desks and office chairs beside floor-to-ceiling windows"
            fill
            sizes="(max-width: 760px) 100vw, 50vw"
            preload
            className="hero-photo"
          />
          <div className="art-card">
            YOUR NEXT GREAT IDEA
            <strong>Has a place here.</strong>
          </div>
          <span className="art-caption">SPACE TO CONNECT. ROOM TO GROW.</span>
        </div>
      </section>
      <section id="spaces" className="section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">FIND YOUR FIT</p>
            <h2>Where would you like to work?</h2>
          </div>
        </div>
        <SpaceSearch />
      </section>
      <section className="how section">
        <div>
          <p className="eyebrow">LESS PLANNING. MORE DOING.</p>
          <h2>
            Your next space,
            <br />
            in a few simple steps.
          </h2>
        </div>
        <div className="how-steps">
          {[
            [
              MapPin,
              "01",
              "Find your space",
              "Browse real spaces at your preferred branch.",
            ],
            [
              CalendarDays,
              "02",
              "Make it your time",
              "Check availability and tell us what you need.",
            ],
            [
              CheckCircle2,
              "03",
              "You’re on your way",
              "Review, submit and receive your booking reference.",
            ],
          ].map(([Icon, number, title, text]) => {
            const Graphic = Icon as typeof MapPin;
            return (
              <article key={String(number)}>
                <Graphic size={24} aria-hidden="true" />
                <span>{String(number)}</span>
                <h3>{String(title)}</h3>
                <p>{String(text)}</p>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
