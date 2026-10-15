create extension if not exists pg_cron with schema pg_catalog;
create index if not exists mappa_rooms_updated on mappa_private.rooms(updated_at);
select cron.schedule('mappa-retention','17 3 * * *', $$
  delete from mappa_private.rooms where updated_at < now() - interval '30 days';
  delete from mappa_private.quotas where window_start < now() - interval '2 days';
$$);
