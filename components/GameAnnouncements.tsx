"use client";
import { useEffect } from "react";
import { BookOpen, X } from "lucide-react";
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
  useEffect(() => {
    if (!event) return;
    const timeout = setTimeout(() => onDismiss(event.id), 4000);
    return () => clearTimeout(timeout);
  }, [event?.id, onDismiss]);
  const t = texts(lang);
  const message = event ? eventText(event.key, event.args, lang) : "";
  return (
    <>
      <div className="sr-only" role="status" aria-atomic="true">
        {message}
      </div>
      {event && (
        <aside className="game-announcement" data-testid="game-announcement">
          <BookOpen size={20} aria-hidden="true" />
          <div>
            <span className="announcement-heading">
              {t.journal}
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
