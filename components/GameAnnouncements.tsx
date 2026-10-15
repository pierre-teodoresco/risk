"use client";
import { useEffect, type CSSProperties } from "react";
import { BookOpen, ShieldOff, X } from "lucide-react";
import type { Log } from "@/lib/game";
import type { Lang } from "@/lib/world";
import { eventText, texts } from "@/lib/i18n";

export default function GameAnnouncements({
  events,
  lang,
  onDismiss,
}: {
  events: Log[];
  lang: Lang;
  onDismiss: (id: string) => void;
}) {
  const event = events[0];
  const elimination = event?.key === "eliminated";
  const duration = elimination ? 6500 : 4000;
  useEffect(() => {
    if (!event) return;
    const timeout = setTimeout(() => onDismiss(event.id), duration);
    return () => clearTimeout(timeout);
  }, [event?.id, duration, onDismiss]);
  const t = texts(lang);
  const message = event ? eventText(event.key, event.args, lang) : "";
  return (
    <>
      <div className="sr-only" role="status" aria-atomic="true">
        {message}
      </div>
      {event && (
        <aside
          className={
            "game-announcement" +
            (elimination ? " announcement-elimination" : "")
          }
          style={
            { "--announcement-duration": `${duration}ms` } as CSSProperties
          }
          data-testid="game-announcement"
        >
          {elimination ? (
            <ShieldOff size={24} aria-hidden="true" />
          ) : (
            <BookOpen size={20} aria-hidden="true" />
          )}
          <div>
            <span className="announcement-heading">
              {elimination ? t.playerEliminated : t.journal}
              {events.length > 1 && (
                <span aria-label={`${events.length - 1} ${t.pendingEvents}`}>
                  +{events.length - 1}
                </span>
              )}
            </span>
            <p>{message}</p>
          </div>
          <button
            onClick={() => onDismiss(event.id)}
            aria-label={t.closeAnnouncement}
          >
            <X size={16} />
          </button>
          <span
            key={event.id}
            className="announcement-lifetime"
            aria-hidden="true"
          />
        </aside>
      )}
    </>
  );
}
