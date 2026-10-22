import { useEffect, useRef, useState } from "react";

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
      className="group/built mx-auto w-[min(1240px,calc(100%-96px))] py-20 text-foreground data-[enhanced=true]:grid data-[enhanced=true]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] data-[enhanced=true]:items-start data-[enhanced=true]:gap-[clamp(40px,7vw,100px)] max-[1100px]:w-[calc(100%-64px)] max-[1100px]:data-[enhanced=true]:gap-10 max-[700px]:w-[calc(100%-40px)] max-[700px]:py-12 max-[700px]:data-[enhanced=true]:grid-cols-[minmax(0,1fr)] max-[700px]:data-[enhanced=true]:gap-0 min-[1440px]:data-[enhanced=true]:w-[min(1560px,calc(100%-96px))] min-[1440px]:data-[enhanced=true]:grid-cols-[minmax(0,1fr)_min(940px,65vw)] min-[1440px]:data-[enhanced=true]:gap-20"
      data-enhanced={enhanced}
      aria-label="Why Quory"
    >
      <div
        className="hidden group-data-[enhanced=true]/built:sticky group-data-[enhanced=true]/built:top-[calc((100svh-var(--panel-height,80svh))/2)] group-data-[enhanced=true]/built:flex group-data-[enhanced=true]/built:h-(--panel-height,80svh) group-data-[enhanced=true]/built:items-center max-[700px]:group-data-[enhanced=true]/built:top-0 max-[700px]:group-data-[enhanced=true]/built:z-2 max-[700px]:group-data-[enhanced=true]/built:-mx-5 max-[700px]:group-data-[enhanced=true]/built:h-auto max-[700px]:group-data-[enhanced=true]/built:bg-[linear-gradient(rgb(var(--background))_90%,rgb(var(--background)/0))] max-[700px]:group-data-[enhanced=true]/built:px-5 max-[700px]:group-data-[enhanced=true]/built:pt-6 max-[700px]:group-data-[enhanced=true]/built:pb-8"
        data-sticky-copy
        aria-hidden="true"
      >
        <div
          className="w-full [--copy-enter:var(--copy-travel)] [--copy-exit-duration:240ms] [--copy-exit:calc(-1*var(--copy-travel))] [--copy-travel:clamp(120px,18svh,200px)] data-[direction=up]:[--copy-enter:calc(-1*var(--copy-travel))] data-[direction=up]:[--copy-exit:var(--copy-travel)]"
          data-direction={direction}
        >
          <div
            key={active}
            className="group/copy grid items-center"
            data-animate={previous !== null}
          >
            {stories.map((story, index) => (
              <div
                key={story.tone}
                className="pointer-events-none opacity-0 [grid-area:1/1] data-[position=active]:opacity-100 group-data-[animate=true]/copy:data-[position=active]:animate-built-for-in group-data-[animate=true]/copy:data-[position=exiting]:animate-built-for-out motion-reduce:transform-none motion-reduce:animate-none! motion-reduce:transition-none"
                data-position={
                  index === active
                    ? "active"
                    : index === previous
                      ? "exiting"
                      : "hidden"
                }
              >
                <div className="max-w-110 font-display text-[clamp(42px,4.6vw,66px)] leading-[1.05] font-medium tracking-[-0.6px] text-balance whitespace-pre-line max-[700px]:max-w-100 max-[700px]:text-[38px]">
                  {story.title}
                </div>
                <div className="mt-6.5 max-[700px]:mt-3.5">
                  <p className="m-0 max-w-90 text-sm leading-[1.85] text-pretty text-foreground max-[1100px]:text-[13px] max-[700px]:max-w-full max-[700px]:text-xs max-[700px]:leading-[1.65]">
                    {story.description}
                  </p>
                  {story.note && (
                    <span className="mt-4 inline-block text-[11px] font-medium text-primary-emphasis max-[700px]:mt-2 max-[700px]:text-[9px]">
                      {story.note}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="min-w-0">
        {stories.map((story, index) => (
          <article
            key={story.tone}
            className="relative flex flex-col justify-center py-[calc(40px/3)] max-[700px]:py-[calc(32px/3)]"
            ref={(element) => {
              panelRefs.current[index] = element;
            }}
            aria-labelledby={`built-for-${story.tone}`}
          >
            <div className="group-data-[enhanced=true]/built:absolute group-data-[enhanced=true]/built:size-px group-data-[enhanced=true]/built:overflow-hidden group-data-[enhanced=true]/built:whitespace-nowrap group-data-[enhanced=true]/built:[clip-path:inset(50%)]">
              <h2
                className="font-display text-4xl/[inherit] font-medium whitespace-pre-line"
                id={`built-for-${story.tone}`}
              >
                {story.title}
              </h2>
              <p className="mb-6 max-w-120 text-muted-foreground">
                {story.description}
              </p>
            </div>
            <div
              className="relative isolate mx-auto grid aspect-[1.1] w-[85%] place-items-center overflow-hidden rounded-[20px] data-[tone=amber]:bg-[radial-gradient(ellipse_at_20%_15%,rgb(var(--warning-subtle)),transparent_60%),radial-gradient(ellipse_at_90%_85%,rgb(var(--connection-7)/0.7),transparent_65%),linear-gradient(135deg,rgb(var(--warning-subtle)),rgb(var(--secondary)))] data-[tone=plum]:bg-[radial-gradient(ellipse_at_85%_20%,rgb(var(--secondary-subtle)),transparent_60%),radial-gradient(ellipse_at_10%_80%,rgb(var(--connection-4)/0.8),transparent_65%),linear-gradient(145deg,rgb(var(--secondary)),rgb(var(--secondary-subtle)))] data-[tone=teal]:bg-[radial-gradient(ellipse_at_15%_15%,rgb(var(--primary-subtle)),transparent_60%),radial-gradient(ellipse_at_85%_85%,rgb(var(--connection-2)/0.75),transparent_65%),linear-gradient(135deg,rgb(var(--primary-subtle)),rgb(var(--primary)))] max-[700px]:aspect-[1.15] max-[700px]:rounded-[14px]"
              data-tone={story.tone}
            >
              <img
                className="block h-auto w-[84%] rounded-lg shadow-[0_16px_24px_rgb(var(--foreground)/0.2)] data-[frame=window]:w-full data-[frame=window]:rounded-none data-[frame=window]:shadow-none"
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
