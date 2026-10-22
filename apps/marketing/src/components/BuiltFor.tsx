import { useEffect, useRef, useState } from "react";
import styles from "./BuiltFor.module.css";

const stories = [
  {
    title: "The data you need\n at light speed.",
    description:
      "A failed payment. A missing order. A customer waiting for an answer. Follow the relationships in your database to understand what happened and get back to the customer with the full picture.",
    tone: "teal",
    imageFrame: "window",
    imageAlt:
      "Quory’s SQL editor and results for a query showing the most rented films by store.",
  },
  {
    title: "Move faster with\na small team.",
    description:
      "Small teams shouldn’t need a custom dashboard for every question. Surface answers from the data you already have, and spend more time building your product than wiring up internal tools.",
    tone: "amber",
    imageFrame: "card",
    imageAlt:
      "Quory’s query prompt, with a database selector and a note that row data stays in Quory.",
  },
  {
    title: "Explore with\nconfidence.",
    description:
      "Get the answers you need with read-only connections that keep writes off the table. Give your team the confidence to explore, with row-level security coming soon for more granular control.",
    tone: "plum",
    imageFrame: "card",
    imageAlt:
      "Quory showing related customer, address, city, and country tables with query results.",
    note: "Row-level security · Coming soon",
  },
];

interface Screenshot {
  src: string;
  srcSet: string;
  width: number;
  height: number;
}

export default function BuiltFor({
  screenshots,
}: {
  screenshots: Screenshot[];
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const panelRefs = useRef<(HTMLElement | null)[]>([]);
  const [{ active, previous, direction }, setSlide] = useState<{
    active: number;
    previous: number | null;
    direction: "up" | "down";
  }>({ active: 0, previous: null, direction: "down" });
  const [enhanced, setEnhanced] = useState(false);

  useEffect(() => setEnhanced(true), []);

  useEffect(() => {
    if (!enhanced) return;
    let frame = 0;

    function update() {
      frame = 0;
      const section = sectionRef.current;
      if (!section) return;
      // Match the sticky area to one panel so its center lines up at both ends.
      const panelHeight = panelRefs.current[0]?.getBoundingClientRect().height;
      if (panelHeight) {
        const value = `${panelHeight}px`;
        if (section.style.getPropertyValue("--panel-height") !== value) {
          section.style.setProperty("--panel-height", value);
        }
      }
      const viewportHeight = document.documentElement.clientHeight;
      const bounds = section.getBoundingClientRect();
      if (bounds.bottom < 0 || bounds.top > viewportHeight) return;

      // Track the panel nearest the reading position, in either scroll direction.
      // On mobile the sticky copy occupies the top portion of the viewport.
      const copy = section.querySelector<HTMLElement>("[data-sticky-copy]");
      const copyHeight = copy?.getBoundingClientRect().height ?? 0;
      const readingLine = window.matchMedia("(max-width: 700px)").matches
        ? copyHeight + (viewportHeight - copyHeight) / 2
        : viewportHeight / 2;
      let closest = 0;
      let distance = Infinity;
      panelRefs.current.forEach((panel, index) => {
        if (!panel) return;
        const rect = panel.getBoundingClientRect();
        const nextDistance = Math.abs(rect.top + rect.height / 2 - readingLine);
        if (nextDistance < distance) {
          distance = nextDistance;
          closest = index;
        }
      });
      setSlide((current) =>
        current.active === closest
          ? current
          : {
              active: closest,
              previous: current.active,
              direction: closest > current.active ? "down" : "up",
            },
      );
    }

    function scheduleUpdate() {
      if (!frame) frame = window.requestAnimationFrame(update);
    }

    const observer = new ResizeObserver(scheduleUpdate);
    if (sectionRef.current) observer.observe(sectionRef.current);
    if (panelRefs.current[0]) observer.observe(panelRefs.current[0]);
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    update();
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [enhanced]);

  return (
    <section
      ref={sectionRef}
      id="why-quory"
      className={styles.section}
      data-enhanced={enhanced}
      aria-label="Why Quory"
    >
      <div className={styles.copy} data-sticky-copy aria-hidden="true">
        <div className={styles.copyInner} data-direction={direction}>
          <div
            key={active}
            className={styles.copySlides}
            data-animate={previous !== null}
          >
            {stories.map((story, index) => (
              <div
                key={story.tone}
                className={styles.copySlide}
                data-position={
                  index === active
                    ? "active"
                    : index === previous
                      ? "exiting"
                      : "hidden"
                }
              >
                <div className={styles.headline}>{story.title}</div>
                <div className={styles.description}>
                  <p>{story.description}</p>
                  {story.note && (
                    <span className={styles.note}>{story.note}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.panels}>
        {stories.map((story, index) => (
          <article
            key={story.tone}
            className={styles.slide}
            ref={(element) => {
              panelRefs.current[index] = element;
            }}
            aria-labelledby={`built-for-${story.tone}`}
          >
            <div className={styles.slideCopy}>
              <h2 id={`built-for-${story.tone}`}>{story.title}</h2>
              <p>{story.description}</p>
            </div>
            <div className={styles.visual} data-tone={story.tone}>
              <img
                className={styles.screenshot}
                data-frame={story.imageFrame}
                {...screenshots[index]}
                sizes={
                  story.imageFrame === "window"
                    ? "(min-width: 1440px) 800px, (min-width: 701px) 45vw, calc(85vw - 34px)"
                    : "(min-width: 1440px) 672px, (min-width: 701px) 38vw, calc(71.4vw - 28.56px)"
                }
                alt={story.imageAlt}
                loading="lazy"
                decoding="async"
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
