-- 给 event_registrations 表添加单打选手标记字段
ALTER TABLE event_registrations ADD COLUMN is_singles_player TINYINT(1) DEFAULT 0 COMMENT '是否参加单打';
