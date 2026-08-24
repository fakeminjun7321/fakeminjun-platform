UPDATE source_streams
SET cadence_minutes = 10
WHERE stream_key IN (
  'mofa-press-rss',
  'unikorea-press-rss',
  'whitehouse-briefings-rss',
  'un-peace-security-rss'
);
