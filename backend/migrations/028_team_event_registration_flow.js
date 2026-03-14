module.exports = {
  async up(pool) {
    const hasColumn = async (tableName, columnName) => {
      const [rows] = await pool.execute(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND COLUMN_NAME = ?`,
        [tableName, columnName]
      );
      return rows.length > 0;
    };

    const hasIndex = async (tableName, indexName) => {
      const [rows] = await pool.execute(
        `SELECT INDEX_NAME
         FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND INDEX_NAME = ?`,
        [tableName, indexName]
      );
      return rows.length > 0;
    };

    const eventColumns = [
      ['min_team_players', "ALTER TABLE events ADD COLUMN min_team_players INT DEFAULT NULL COMMENT '团体赛每队最少人数' AFTER max_participants"],
      ['max_team_players', "ALTER TABLE events ADD COLUMN max_team_players INT DEFAULT NULL COMMENT '团体赛每队最多人数' AFTER min_team_players"],
      ['gender_rule', "ALTER TABLE events ADD COLUMN gender_rule ENUM('unlimited', 'male_only', 'female_only', 'fixed', 'minimum') DEFAULT 'unlimited' COMMENT '团体赛性别规则' AFTER max_team_players"],
      ['required_male_count', "ALTER TABLE events ADD COLUMN required_male_count INT DEFAULT 0 COMMENT '团体赛男生人数要求' AFTER gender_rule"],
      ['required_female_count', "ALTER TABLE events ADD COLUMN required_female_count INT DEFAULT 0 COMMENT '团体赛女生人数要求' AFTER required_male_count"],
      ['singles_player_count', "ALTER TABLE events ADD COLUMN singles_player_count INT DEFAULT NULL COMMENT '团体赛每队单打人数' AFTER required_female_count"]
    ];

    for (const [columnName, sql] of eventColumns) {
      if (!(await hasColumn('events', columnName))) {
        await pool.execute(sql);
        console.log(`Added ${columnName} column to events`);
      }
    }

    const registrationColumns = [
      ['team_submit_status', "ALTER TABLE event_registrations ADD COLUMN team_submit_status ENUM('draft', 'submitted') DEFAULT 'submitted' COMMENT '团体赛组队提交状态' AFTER team_leader_id"],
      ['team_submitted_at', "ALTER TABLE event_registrations ADD COLUMN team_submitted_at DATETIME NULL COMMENT '团体赛正式提交时间' AFTER team_submit_status"]
    ];

    for (const [columnName, sql] of registrationColumns) {
      if (!(await hasColumn('event_registrations', columnName))) {
        await pool.execute(sql);
        console.log(`Added ${columnName} column to event_registrations`);
      }
    }

    if (!(await hasColumn('team_invitations', 'invite_token'))) {
      await pool.execute(
        "ALTER TABLE team_invitations ADD COLUMN invite_token VARCHAR(64) NULL COMMENT '分享邀请令牌' AFTER invitee_id"
      );
      console.log('Added invite_token column to team_invitations');
    }

    if (!(await hasIndex('team_invitations', 'uk_team_invite_token'))) {
      await pool.execute(
        'ALTER TABLE team_invitations ADD UNIQUE KEY uk_team_invite_token (invite_token)'
      );
      console.log('Added uk_team_invite_token index to team_invitations');
    }

    await pool.execute(
      "ALTER TABLE team_invitations MODIFY COLUMN invitee_id INT NULL"
    );
    await pool.execute(
      "ALTER TABLE team_invitations MODIFY COLUMN status ENUM('pending', 'accepted', 'rejected', 'cancelled', 'expired') DEFAULT 'pending'"
    );

    await pool.execute(`
      UPDATE event_registrations
      SET team_submit_status = CASE
        WHEN is_team_leader = 1 OR team_leader_id IS NOT NULL OR team_name IS NOT NULL THEN
          CASE
            WHEN team_name IS NULL OR team_name = '' THEN 'draft'
            ELSE 'submitted'
          END
        ELSE team_submit_status
      END
    `);

    await pool.execute(`
      UPDATE event_registrations
      SET team_submitted_at = CASE
        WHEN team_submit_status = 'submitted' AND team_submitted_at IS NULL THEN confirmed_at
        ELSE team_submitted_at
      END
      WHERE is_team_leader = 1 OR team_leader_id IS NOT NULL OR team_name IS NOT NULL
    `);
  }
};
