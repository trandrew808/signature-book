-- Adds the frame style a guest chose when signing ('print' or 'none').
alter table photos add column if not exists frame text;
