-- 修复 matches 表允许 event_id 为 NULL（约球比赛没有关联赛事）
ALTER TABLE matches MODIFY COLUMN event_id INT NULL COMMENT '赛事ID（约球比赛为NULL）';
