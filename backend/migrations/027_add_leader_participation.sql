ALTER TABLE captain_applications
ADD COLUMN is_participating TINYINT(1) DEFAULT 1 COMMENT '领队是否参赛';

ALTER TABLE event_registrations
ADD COLUMN is_participating TINYINT(1) DEFAULT 1 COMMENT '是否参赛成员（领队可不参赛）' AFTER is_team_leader;
