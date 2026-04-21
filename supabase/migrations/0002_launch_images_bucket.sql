-- Public bucket holding launch thumbnails. Uploads gated server-side by
-- the service role in /api/upload-image, so public read is fine.

insert into storage.buckets (id, name, public)
values ('launch-images', 'launch-images', true)
on conflict (id) do nothing;
