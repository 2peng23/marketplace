begin;

alter table public.messages
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_send_started_at timestamptz;

commit;
