-- 修复 event_format 枚举，添加 group_knockout 选项
ALTER TABLE events MODIFY COLUMN event_format ENUM('round_robin', 'knockout', 'group_knockout') NOT NULL COMMENT '赛制：循环赛/淘汰赛/小组+淘汰';
