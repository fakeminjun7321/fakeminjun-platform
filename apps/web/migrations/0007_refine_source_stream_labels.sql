UPDATE source_streams
SET selection_reason = '한국 관련성 판단 전 미국 행정부 공식 발표를 수집'
WHERE stream_key = 'whitehouse-briefings-rss';

UPDATE source_streams
SET selection_reason = '급변 여부 판단 전 UN 평화·안보 자료를 관측'
WHERE stream_key = 'un-peace-security-rss';
