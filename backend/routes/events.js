// backend/routes/events.js
const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { calculateMatchRating } = require('../utils/ratingCalculator');
const subscribeMessage = require('../utils/subscribeMessage');
const {
  normalizeTeamEventConfig,
  buildSubmittedTeamSummaries,
  createInviteToken
} = require('../utils/teamEvent');

// 将相对URL转为完整URL
function toFullUrl(url, req) {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;

  let baseUrl = process.env.BASE_URL;
  if (!baseUrl) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (host) {
      baseUrl = `${protocol}://${host}`;
    } else {
      baseUrl = 'https://express-lksv-207842-4-1391867763.sh.run.tcloudbase.com';
    }
  }
  return baseUrl + url;
}

// 处理description中的图片URL，转换为小程序rich-text支持的格式
function processDescription(description, req) {
  if (!description) return description;

  // 获取 baseUrl，优先使用环境变量
  let baseUrl = process.env.BASE_URL;
  if (!baseUrl) {
    // 尝试从请求头获取
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (host) {
      baseUrl = `${protocol}://${host}`;
    } else {
      // 默认值（腾讯云函数部署地址）
      baseUrl = 'https://express-lksv-207842-4-1391867763.sh.run.tcloudbase.com';
    }
  }

  let processed = description;

  // 1. 处理已有的img标签，简化并转换相对路径为绝对路径
  // 匹配所有 <img ...> 标签
  processed = processed.replace(/<img\s+([^>]*)>/gi, (match, attrs) => {
    // 提取 src 属性
    const srcMatch = attrs.match(/src=["']([^"']+)["']/i);
    if (srcMatch) {
      let src = srcMatch[1];
      // 如果是相对路径，转为绝对路径
      if (src.startsWith('/uploads/')) {
        src = baseUrl + src;
      }
      // 返回简化的img标签，小程序rich-text只支持基本属性
      return `<img src="${src}">`;
    }
    return match;
  });

  // 2. 处理纯文本形式的完整图片URL
  // 匹配独立的 https://xxx.jpg 格式（不在引号或标签内）
  processed = processed.replace(/(^|>|\s)(https?:\/\/[^\s<>"']+\.(jpg|jpeg|png|gif|webp))(\s|<|$)/gim, (match, before, url, ext, after) => {
    return `${before}<img src="${url}">${after}`;
  });

  // 3. 处理纯文本形式的相对路径
  processed = processed.replace(/(^|>|\s)(\/uploads\/[^\s<>"']+\.(jpg|jpeg|png|gif|webp))(\s|<|$)/gim, (match, before, path, ext, after) => {
    return `${before}<img src="${baseUrl}${path}">${after}`;
  });

  return processed;
}

// 动态计算赛事状态
function computeEventStatus(event) {
  const now = new Date();
  const regEnd = event.registration_end ? new Date(event.registration_end) : null;
  const eventEnd = event.event_end ? new Date(event.event_end) : null;
  const eventStart = event.event_start ? new Date(event.event_start) : null;

  // 草稿和取消状态不变
  if (event.status === 'draft' || event.status === 'cancelled') {
    return event.status;
  }

  // 已手动设为已结束的不变
  if (event.status === 'finished') {
    return 'finished';
  }

  // 动态判断：已结束 = 过了 event_end 当天 24:00
  if (eventEnd) {
    const endOfDay = new Date(eventEnd);
    endOfDay.setHours(23, 59, 59, 999);
    if (now > endOfDay) {
      return 'finished';
    }
  }

  // 进行中 = 比赛开始时间 ≤ 当前时间 ≤ event_end 当天 24:00
  if (eventStart && now >= eventStart) {
    return 'ongoing';
  }

  // 待开始 = 报名截止 ≤ 当前时间 < 比赛开始时间
  if (regEnd && now >= regEnd) {
    return 'pending_start';
  }

  // 人满也变待开始
  if (event.participant_count >= event.max_participants) {
    return 'pending_start';
  }

  return 'registration';
}

function isSubmittedTeamRow(row) {
  return !row.team_name || (row.team_submit_status || 'submitted') === 'submitted';
}

async function getEventById(eventId) {
  const [events] = await pool.query(
    `SELECT e.*,
      (SELECT COUNT(*) FROM event_registrations
       WHERE event_id = e.id
         AND status != 'cancelled'
         AND (team_name IS NULL OR COALESCE(team_submit_status, 'submitted') = 'submitted')) as participant_count,
      (SELECT COUNT(DISTINCT team_name) FROM event_registrations
       WHERE event_id = e.id
         AND status != 'cancelled'
         AND team_name IS NOT NULL
         AND COALESCE(team_submit_status, 'submitted') = 'submitted') as team_count
     FROM events e
     WHERE e.id = ?`,
    [eventId]
  );
  return events[0] || null;
}

async function getCaptainApplication(eventId, userId, connection = pool) {
  const [rows] = await connection.query(
    'SELECT * FROM captain_applications WHERE event_id = ? AND user_id = ?',
    [eventId, userId]
  );
  return rows[0] || null;
}

async function getLeaderRegistration(eventId, leaderId, connection = pool) {
  const [rows] = await connection.query(
    `SELECT *
     FROM event_registrations
     WHERE event_id = ?
       AND user_id = ?
       AND is_team_leader = 1
     ORDER BY id DESC
     LIMIT 1`,
    [eventId, leaderId]
  );
  return rows[0] || null;
}

async function getTeamMembers(eventId, leaderId, connection = pool) {
  const [rows] = await connection.query(
    `SELECT er.*,
            u.name,
            u.phone,
            u.gender,
            u.avatar_url,
            s.name as school_name,
            c.name as college_name
     FROM event_registrations er
     JOIN users u ON er.user_id = u.id
     LEFT JOIN schools s ON u.school_id = s.id
     LEFT JOIN colleges c ON u.college_id = c.id
     WHERE er.event_id = ?
       AND er.status != 'cancelled'
       AND (
         (er.is_team_leader = 1 AND er.user_id = ?)
         OR (er.is_team_leader = 0 AND er.team_leader_id = ?)
       )
     ORDER BY er.is_team_leader DESC, er.registered_at, er.id`,
    [eventId, leaderId, leaderId]
  );
  return rows;
}

async function getUserTeamContext(eventId, userId, connection = pool) {
  const numericUserId = parseInt(userId, 10);
  if (!Number.isInteger(numericUserId)) {
    return {
      registration: null,
      leaderId: null,
      leaderReg: null,
      viewerRole: null
    };
  }

  const [rows] = await connection.query(
    `SELECT *
     FROM event_registrations
     WHERE event_id = ?
       AND user_id = ?
       AND status != 'cancelled'
     ORDER BY is_team_leader DESC, id DESC
     LIMIT 1`,
    [eventId, numericUserId]
  );

  const registration = rows[0] || null;
  if (!registration) {
    return {
      registration: null,
      leaderId: null,
      leaderReg: null,
      viewerRole: null
    };
  }

  const leaderId = registration.is_team_leader
    ? numericUserId
    : parseInt(registration.team_leader_id, 10) || null;
  const leaderReg = leaderId ? await getLeaderRegistration(eventId, leaderId, connection) : null;

  return {
    registration,
    leaderId,
    leaderReg,
    viewerRole: registration.is_team_leader ? 'leader' : 'member'
  };
}

async function getTeamInvitations(eventId, leaderId, connection = pool, statuses = null) {
  const params = [eventId, leaderId];
  let statusClause = '';

  if (Array.isArray(statuses) && statuses.length > 0) {
    statusClause = ` AND i.status IN (${statuses.map(() => '?').join(',')})`;
    params.push(...statuses);
  }

  const [rows] = await connection.query(
    `SELECT i.id,
            i.event_id,
            i.inviter_id,
            i.invitee_id,
            i.invite_token,
            i.status,
            i.created_at,
            i.responded_at,
            u.id as invitee_user_id,
            u.name as invitee_name,
            u.phone as invitee_phone,
            u.gender as invitee_gender,
            u.avatar_url as invitee_avatar_url,
            s.name as invitee_school_name,
            c.name as invitee_college_name
     FROM team_invitations i
      LEFT JOIN users u ON i.invitee_id = u.id
      LEFT JOIN schools s ON u.school_id = s.id
      LEFT JOIN colleges c ON u.college_id = c.id
      WHERE i.event_id = ?
        AND i.inviter_id = ?
        AND i.type = 'team'
        ${statusClause}
      ORDER BY i.created_at ASC, i.id ASC`,
    params
  );
  return rows;
}

async function getPendingTeamInvitations(eventId, leaderId, connection = pool) {
  return getTeamInvitations(eventId, leaderId, connection, ['pending']);
}

async function getTeamInvitationResponderEligibility(invitation, userId, connection = pool) {
  const numericUserId = parseInt(userId, 10);
  if (!Number.isInteger(numericUserId)) {
    return {
      canRespond: false,
      message: '缺少用户ID',
      user: null
    };
  }

  const [users] = await connection.query(
    'SELECT id, name, gender FROM users WHERE id = ? LIMIT 1',
    [numericUserId]
  );
  if (users.length === 0) {
    return {
      canRespond: false,
      message: '用户不存在',
      user: null
    };
  }

  if (parseInt(invitation.inviter_id, 10) === numericUserId) {
    return {
      canRespond: false,
      message: '您是该队伍领队，无需处理此邀请',
      user: users[0]
    };
  }

  if (invitation.invitee_id && parseInt(invitation.invitee_id, 10) !== numericUserId) {
    return {
      canRespond: false,
      message: '该邀请已被其他用户处理',
      user: users[0]
    };
  }

  const [activeRegs] = await connection.query(
    `SELECT team_name, is_team_leader
     FROM event_registrations
     WHERE event_id = ? AND user_id = ? AND status != 'cancelled'`,
    [invitation.event_id, numericUserId]
  );
  if (activeRegs.length > 0) {
    const isLeader = activeRegs.some((row) => row.is_team_leader);
    return {
      canRespond: false,
      message: isLeader
        ? '您已是该赛事领队，不能加入其他队伍'
        : '您已加入该赛事其他队伍，不能重复加入',
      user: users[0]
    };
  }

  const captainApp = await getCaptainApplication(invitation.event_id, numericUserId, connection);
  if (captainApp?.status === 'approved') {
    return {
      canRespond: false,
      message: '您已通过该赛事领队审核，不能加入其他队伍',
      user: users[0]
    };
  }
  if (captainApp?.status === 'pending') {
    return {
      canRespond: false,
      message: '您已申请成为该赛事领队，不能加入其他队伍',
      user: users[0]
    };
  }

  return {
    canRespond: true,
    message: '',
    user: users[0]
  };
}

const TEAM_PROJECT_RULES = {
  men_singles: {
    label: '男单',
    playerCount: 1,
    genders: ['male']
  },
  women_singles: {
    label: '女单',
    playerCount: 1,
    genders: ['female']
  },
  men_doubles: {
    label: '男双',
    playerCount: 2,
    genders: ['male', 'male']
  },
  women_doubles: {
    label: '女双',
    playerCount: 2,
    genders: ['female', 'female']
  },
  mixed_doubles: {
    label: '混双',
    playerCount: 2,
    genders: ['male', 'female']
  }
};

function normalizeTeamProjectConfig(teamEventConfig = {}) {
  let parsedConfig = teamEventConfig;
  if (typeof parsedConfig === 'string') {
    try {
      parsedConfig = JSON.parse(parsedConfig);
    } catch (error) {
      parsedConfig = {};
    }
  }

  const rawProjects = parsedConfig?.projects || {};
  const projects = {};

  Object.keys(TEAM_PROJECT_RULES).forEach((projectType) => {
    const rawProject = rawProjects[projectType] || {};
    projects[projectType] = {
      enabled: !!rawProject.enabled,
      count: Math.max(0, parseInt(rawProject.count, 10) || 0)
    };
  });

  return { projects };
}

async function getTeamProjectAssignments(eventId, teamName, connection = pool) {
  if (!teamName) {
    return [];
  }

  const [rows] = await connection.query(
    `SELECT project_type, position, player_a_id, player_b_id
     FROM team_project_assignments
     WHERE event_id = ? AND team_name = ?
     ORDER BY project_type, position`,
    [eventId, teamName]
  );
  return rows;
}

function sanitizeTeamProjectAssignments(assignments = [], participants = []) {
  const participantIds = new Set(
    participants
      .map((participant) => parseInt(participant.user_id || participant.id, 10))
      .filter((id) => Number.isInteger(id))
  );
  let changed = false;

  const sanitizedAssignments = assignments.reduce((result, assignment) => {
    if (!assignment) {
      return result;
    }

    const nextAssignment = { ...assignment };
    const playerAKey = Object.prototype.hasOwnProperty.call(nextAssignment, 'player_a_id') ? 'player_a_id' : 'player_a';
    const playerBKey = Object.prototype.hasOwnProperty.call(nextAssignment, 'player_b_id') ? 'player_b_id' : 'player_b';
    const playerAId = parseInt(nextAssignment[playerAKey], 10);
    const playerBId = parseInt(nextAssignment[playerBKey], 10);

    if (Number.isInteger(playerAId) && !participantIds.has(playerAId)) {
      nextAssignment[playerAKey] = null;
      changed = true;
    }

    if (Number.isInteger(playerBId) && !participantIds.has(playerBId)) {
      nextAssignment[playerBKey] = null;
      changed = true;
    }

    if (nextAssignment[playerAKey] || nextAssignment[playerBKey]) {
      result.push(nextAssignment);
    } else {
      changed = true;
    }

    return result;
  }, []);

  return {
    assignments: sanitizedAssignments,
    changed
  };
}

function isEffectiveTeamProjectAssignment(projectType, assignment) {
  const rule = TEAM_PROJECT_RULES[projectType];
  if (!rule || !assignment) {
    return false;
  }

  const hasPlayerA = !!assignment.player_a_id || !!assignment.player_a;
  const hasPlayerB = !!assignment.player_b_id || !!assignment.player_b;

  if (rule.playerCount === 1) {
    return hasPlayerA;
  }

  return hasPlayerA && hasPlayerB;
}

function buildMemberProjectsFromAssignments(assignments = []) {
  const memberProjects = {};

  assignments.forEach((assignment) => {
    const projectType = assignment.project_type || assignment.project;
    if (!isEffectiveTeamProjectAssignment(projectType, assignment)) {
      return;
    }

    const playerAId = assignment.player_a_id || assignment.player_a;
    const playerBId = assignment.player_b_id || assignment.player_b;

    if (playerAId) {
      if (!memberProjects[playerAId]) {
        memberProjects[playerAId] = [];
      }
      memberProjects[playerAId].push(projectType);
    }

    if (playerBId) {
      if (!memberProjects[playerBId]) {
        memberProjects[playerBId] = [];
      }
      memberProjects[playerBId].push(projectType);
    }
  });

  return memberProjects;
}

function validateTeamSubmitParticipants(event, participants = []) {
  const config = normalizeTeamEventConfig(event);
  const errors = [];
  const summary = participants.reduce((result, participant) => {
    result.totalCount += 1;
    if (participant.gender === 'male') {
      result.maleCount += 1;
    } else if (participant.gender === 'female') {
      result.femaleCount += 1;
    }
    return result;
  }, {
    totalCount: 0,
    maleCount: 0,
    femaleCount: 0
  });

  if (summary.totalCount < config.minTeamPlayers) {
    errors.push(`每队至少需要 ${config.minTeamPlayers} 名实际参赛队员`);
  }
  if (summary.totalCount > config.maxTeamPlayers) {
    errors.push(`每队最多只能有 ${config.maxTeamPlayers} 名实际参赛队员`);
  }

  if (config.genderRule === 'fixed' || config.genderRule === 'minimum') {
    return {
      valid: errors.length === 0,
      errors,
      config,
      summary
    };
  }

  switch (config.genderRule) {
    case 'male_only':
      if (summary.femaleCount > 0) {
        errors.push('该赛事仅允许男子团体报名');
      }
      break;
    case 'female_only':
      if (summary.maleCount > 0) {
        errors.push('该赛事仅允许女子团体报名');
      }
      break;
    case 'fixed':
      if (
        summary.maleCount !== config.requiredMaleCount ||
        summary.femaleCount !== config.requiredFemaleCount
      ) {
        errors.push(`实际参赛名单必须为男 ${config.requiredMaleCount} 人、女 ${config.requiredFemaleCount} 人`);
      }
      break;
    case 'minimum':
      if (summary.maleCount < config.requiredMaleCount || summary.femaleCount < config.requiredFemaleCount) {
        errors.push(`实际参赛名单至少需要男 ${config.requiredMaleCount} 人、女 ${config.requiredFemaleCount} 人`);
      }
      break;
    default:
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
    config,
    summary
  };
}

function validateTeamProjectAssignmentsForSubmit({ teamProjectConfig, participants = [], assignments = [], requireComplete = true }) {
  const config = normalizeTeamProjectConfig(teamProjectConfig);
  const participantMap = new Map(
    participants.map((participant) => [
      parseInt(participant.user_id || participant.id, 10),
      participant
    ])
  );
  const groupedAssignments = {};
  const errors = new Set();
  const singlesPlayerIds = new Set();

  assignments.forEach((assignment) => {
    const projectType = assignment.project_type || assignment.project;
    const projectRule = TEAM_PROJECT_RULES[projectType];
    const projectConfig = config.projects[projectType];
    const position = parseInt(assignment.position, 10);

    if (!projectRule || !projectConfig?.enabled) {
      return;
    }
    if (!Number.isInteger(position) || position < 1 || position > projectConfig.count) {
      errors.add(`${projectRule.label}分配超出配置范围`);
      return;
    }

    if (!groupedAssignments[projectType]) {
      groupedAssignments[projectType] = new Map();
    }
    if (groupedAssignments[projectType].has(position)) {
      errors.add(`${projectRule.label}存在重复分配`);
      return;
    }

    groupedAssignments[projectType].set(position, assignment);
  });

  const validatePlayer = (playerId, expectedGender, projectLabel, roleLabel) => {
    const numericPlayerId = parseInt(playerId, 10);
    if (!Number.isInteger(numericPlayerId) || !participantMap.has(numericPlayerId)) {
      errors.add(`${projectLabel}${roleLabel}必须从已加入队员中选择`);
      return null;
    }

    const player = participantMap.get(numericPlayerId);
    if (expectedGender && player.gender !== expectedGender) {
      errors.add(`${projectLabel}${roleLabel}性别不符合要求`);
    }
    return numericPlayerId;
  };

  Object.entries(TEAM_PROJECT_RULES).forEach(([projectType, projectRule]) => {
    const projectConfig = config.projects[projectType];
    if (!projectConfig?.enabled || projectConfig.count <= 0) {
      return;
    }

    const positionAssignments = groupedAssignments[projectType] || new Map();
    for (let position = 1; position <= projectConfig.count; position += 1) {
      const assignment = positionAssignments.get(position);
      if (!assignment) {
        if (!requireComplete) {
          continue;
        }
        errors.add(`请先完成${projectRule.label}项目分配`);
        continue;
      }

      if (!requireComplete && !isEffectiveTeamProjectAssignment(projectType, assignment)) {
        continue;
      }

      const playerAId = validatePlayer(
        assignment.player_a_id,
        projectRule.genders[0],
        projectRule.label,
        projectRule.playerCount === 1 ? '' : '选手A'
      );

      if (projectRule.playerCount === 1) {
        if (playerAId) {
          singlesPlayerIds.add(playerAId);
        }
        continue;
      }

      const playerBId = validatePlayer(
        assignment.player_b_id,
        projectRule.genders[1],
        projectRule.label,
        '选手B'
      );

      if (playerAId && playerBId && playerAId === playerBId) {
        errors.add(`${projectRule.label}不能选择同一名队员`);
      }
    }
  });

  return {
    valid: errors.size === 0,
    errors: Array.from(errors),
    singlesPlayerIds: Array.from(singlesPlayerIds)
  };
}

async function upsertLeaderDraft(connection, { eventId, leaderId, teamName, leaderParticipating }) {
  const existing = await getLeaderRegistration(eventId, leaderId, connection);

  if (existing && existing.status !== 'cancelled' && (existing.team_submit_status || 'submitted') === 'submitted') {
    throw new Error('队伍已正式提交，不能再修改');
  }

  if (existing) {
    await connection.execute(
      `UPDATE event_registrations
       SET team_name = ?,
           is_participating = ?,
           is_singles_player = CASE WHEN ? = 1 THEN is_singles_player ELSE 0 END,
           is_team_leader = 1,
           team_leader_id = NULL,
           team_submit_status = 'draft',
           team_submitted_at = NULL,
           status = 'confirmed',
           partner_id = NULL,
           partner_status = NULL
       WHERE id = ?`,
      [teamName, leaderParticipating ? 1 : 0, leaderParticipating ? 1 : 0, existing.id]
    );
  } else {
    await connection.execute(
      `INSERT INTO event_registrations (
        event_id, user_id, team_name, is_team_leader, team_leader_id,
        is_participating, is_singles_player, status, team_submit_status, team_submitted_at
      ) VALUES (?, ?, ?, 1, NULL, ?, 0, 'confirmed', 'draft', NULL)`,
      [eventId, leaderId, teamName, leaderParticipating ? 1 : 0]
    );
  }

  await connection.execute(
    `UPDATE captain_applications
     SET is_participating = ?
     WHERE event_id = ? AND user_id = ?`,
    [leaderParticipating ? 1 : 0, eventId, leaderId]
  );

  await connection.execute(
    `UPDATE event_registrations
     SET team_name = ?
     WHERE event_id = ?
       AND team_leader_id = ?
       AND status != 'cancelled'
       AND COALESCE(team_submit_status, 'submitted') = 'draft'`,
    [teamName, eventId, leaderId]
  );
}

// 获取赛事列表
router.get('/', async (req, res) => {
  try {
    const { school_id, status, event_type, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT e.*, s.name as school_name, u.name as creator_name,
        (SELECT COUNT(*) FROM event_registrations
         WHERE event_id = e.id
           AND status != 'cancelled'
           AND (team_name IS NULL OR COALESCE(team_submit_status, 'submitted') = 'submitted')) as participant_count,
        (SELECT COUNT(DISTINCT team_name) FROM event_registrations
         WHERE event_id = e.id
           AND status != 'cancelled'
           AND team_name IS NOT NULL
           AND COALESCE(team_submit_status, 'submitted') = 'submitted') as team_count
      FROM events e
      LEFT JOIN schools s ON e.school_id = s.id
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.status != 'draft'
    `;
    const params = [];

    if (school_id) {
      // 校际赛、school_id为null的赛事、以及本校校内赛对用户可见
      sql += " AND (e.scope = 'inter_school' OR e.school_id IS NULL OR (e.scope = 'school' AND e.school_id = ?))";
      params.push(school_id);
    }
    if (event_type) {
      sql += ' AND e.event_type = ?';
      params.push(event_type);
    }

    // 不在SQL层面过滤status，改为在应用层过滤（因为status是动态计算的）
    sql += ' ORDER BY e.event_start DESC';

    const [allRows] = await pool.query(sql, params);

    // 动态计算状态并过滤
    let filteredRows = allRows.map(e => ({ ...e, status: computeEventStatus(e) }));
    if (status) {
      filteredRows = filteredRows.filter(e => e.status === status);
    }

    // 手动分页
    const total = filteredRows.length;
    const pagedRows = filteredRows.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      success: true,
      data: {
        list: pagedRows,
        total,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('获取赛事列表失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ========== 比赛详情相关路由（必须在 /:id 之前定义） ==========

// 获取比赛详情
router.get('/matches/:matchId', async (req, res) => {
  try {
    const { matchId } = req.params;

    const [matches] = await pool.query(
      `SELECT m.*,
        u1.name as player1_name,
        u1.avatar_url as player1_avatar,
        u2.name as player2_name,
        u2.avatar_url as player2_avatar,
        e.title as event_title
       FROM matches m
       LEFT JOIN users u1 ON m.player1_id = u1.id
       LEFT JOIN users u2 ON m.player2_id = u2.id
       LEFT JOIN events e ON m.event_id = e.id
       WHERE m.id = ?`,
      [matchId]
    );

    if (matches.length === 0) {
      return res.status(404).json({ success: false, message: '比赛不存在' });
    }

    const match = matches[0];

    // 获取比分详情
    const [scores] = await pool.query(
      `SELECT game_number, player1_score, player2_score
       FROM match_scores
       WHERE match_id = ?
       ORDER BY game_number`,
      [matchId]
    );

    match.scores = scores;

    res.json({ success: true, data: match });
  } catch (error) {
    console.error('获取比赛详情失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 录入比分
router.post('/matches/:matchId/score', async (req, res) => {
  try {
    const { matchId } = req.params;
    const { scores, recorded_by } = req.body;
    // scores: [{ game_number: 1, player1_score: 11, player2_score: 9 }, ...]

    if (!scores || !Array.isArray(scores)) {
      return res.status(400).json({ success: false, message: '比分数据格式错误' });
    }

    // 删除旧比分，插入新比分
    await pool.execute('DELETE FROM match_scores WHERE match_id = ?', [matchId]);

    for (const score of scores) {
      await pool.execute(
        `INSERT INTO match_scores (match_id, game_number, player1_score, player2_score, recorded_by)
         VALUES (?, ?, ?, ?, ?)`,
        [matchId, score.game_number, score.player1_score, score.player2_score, recorded_by]
      );
    }

    // 计算局数（注意：前端传来的分数可能是字符串，需转为数值比较）
    let player1Games = 0, player2Games = 0;
    for (const score of scores) {
      const p1 = Number(score.player1_score);
      const p2 = Number(score.player2_score);
      if (p1 > p2) player1Games++;
      else if (p2 > p1) player2Games++;
    }

    // 更新比赛状态
    await pool.execute(
      `UPDATE matches SET
        player1_games = ?, player2_games = ?,
        status = 'pending_confirm'
       WHERE id = ?`,
      [player1Games, player2Games, matchId]
    );

    // 发送订阅消息通知对手确认比分
    try {
      const [matchInfo] = await pool.query(
        `SELECT m.*, e.title as event_name,
          u1.name as player1_name, u1.openid as player1_openid,
          u2.name as player2_name, u2.openid as player2_openid
         FROM matches m
         LEFT JOIN events e ON m.event_id = e.id
         LEFT JOIN users u1 ON m.player1_id = u1.id
         LEFT JOIN users u2 ON m.player2_id = u2.id
         WHERE m.id = ?`,
        [matchId]
      );

      if (matchInfo.length > 0) {
        const match = matchInfo[0];
        // 确定对手和录入者
        const isPlayer1 = recorded_by === match.player1_id;
        const opponentOpenid = isPlayer1 ? match.player2_openid : match.player1_openid;
        const recorderName = isPlayer1 ? match.player1_name : match.player2_name;

        // 构建比分字符串
        const scoreStr = `${player1Games}:${player2Games}`;

        if (opponentOpenid) {
          await subscribeMessage.sendScoreConfirmNotice(opponentOpenid, {
            matchInfo: match.event_name || '友谊赛',
            opponentName: recorderName || '对手',
            score: scoreStr,
            time: subscribeMessage.formatTime(new Date()),
            page: `pages/score-confirm/score-confirm?matchId=${matchId}`
          });
        }
      }
    } catch (notifyError) {
      console.error('发送比分确认通知失败:', notifyError);
      // 通知失败不影响主流程
    }

    res.json({ success: true, message: '比分已录入' });
  } catch (error) {
    console.error('录入比分失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 确认比分
router.post('/matches/:matchId/confirm', async (req, res) => {
  try {
    const { matchId } = req.params;
    const { user_id, is_admin } = req.body;

    const [matches] = await pool.query('SELECT * FROM matches WHERE id = ?', [matchId]);
    if (matches.length === 0) {
      return res.status(404).json({ success: false, message: '比赛不存在' });
    }

    const match = matches[0];
    let updateField = '';

    if (is_admin) {
      updateField = 'admin_confirmed = 1';
    } else if (user_id === match.player1_id) {
      updateField = 'player1_confirmed = 1';
    } else if (user_id === match.player2_id) {
      updateField = 'player2_confirmed = 1';
    } else {
      return res.status(403).json({ success: false, message: '无权确认此比赛' });
    }

    await pool.execute(`UPDATE matches SET ${updateField} WHERE id = ?`, [matchId]);

    // 检查是否双方都确认了
    const [updated] = await pool.query('SELECT * FROM matches WHERE id = ?', [matchId]);
    const m = updated[0];

    if ((m.player1_confirmed && m.player2_confirmed) || m.admin_confirmed) {
      // 确定胜者和败者
      const winnerId = m.player1_games > m.player2_games ? m.player1_id : m.player2_id;
      const loserId = winnerId === m.player1_id ? m.player2_id : m.player1_id;

      // 更新比赛状态
      await pool.execute(
        `UPDATE matches SET status = 'finished', winner_id = ?, finished_at = NOW() WHERE id = ?`,
        [winnerId, matchId]
      );

      // 计算积分变化（仅单打赛事且计入排名时）
      const [events] = await pool.query(
        'SELECT * FROM events WHERE id = ?',
        [m.event_id]
      );

      if (events.length > 0) {
        const event = events[0];
        // 只有单打赛事且 counts_for_ranking = 1 时才计算积分
        if (event.event_type === 'singles' && event.counts_for_ranking) {
          await updatePlayerRatings(m.event_id, matchId, winnerId, loserId);
        }
      }
    }

    res.json({ success: true, message: '已确认' });
  } catch (error) {
    console.error('确认比分失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ========== 赛事详情相关路由 ==========

// 获取赛事详情
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [events] = await pool.query(`
      SELECT e.*, s.name as school_name, u.name as creator_name,
        (SELECT COUNT(*) FROM event_registrations
         WHERE event_id = e.id
           AND status != 'cancelled'
           AND (team_name IS NULL OR COALESCE(team_submit_status, 'submitted') = 'submitted')) as participant_count
      FROM events e
      LEFT JOIN schools s ON e.school_id = s.id
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.id = ?
    `, [id]);

    if (events.length === 0) {
      return res.status(404).json({ success: false, message: '赛事不存在' });
    }

    // 动态计算状态
    const event = events[0];
    event.status = computeEventStatus(event);
    // 处理description中的图片URL
    event.description = processDescription(event.description, req);

    // 获取报名列表（双打赛事额外查询搭档信息）
    let registrationsSql = `
      SELECT er.*, u.name, u.avatar_url, u.college_id,
             c.name as college_name, s.name as school_name,
             pu.name as partner_name, pu.avatar_url as partner_avatar_url,
             ps.name as partner_school_name, pc.name as partner_college_name
      FROM event_registrations er
      JOIN users u ON er.user_id = u.id
      LEFT JOIN colleges c ON u.college_id = c.id
      LEFT JOIN schools s ON u.school_id = s.id
      LEFT JOIN users pu ON er.partner_id = pu.id
      LEFT JOIN schools ps ON pu.school_id = ps.id
      LEFT JOIN colleges pc ON pu.college_id = pc.id
      WHERE er.event_id = ? AND er.status != 'cancelled'
    `;

    if (event.event_type === 'team') {
      registrationsSql += " AND COALESCE(er.team_submit_status, 'submitted') = 'submitted'";
    }

    registrationsSql += `
      ORDER BY er.registered_at
    `;

    const [registrations] = await pool.query(registrationsSql, [id]);

    res.json({
      success: true,
      data: {
        event,
        registrations
      }
    });
  } catch (error) {
    console.error('获取赛事详情失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取可选搭档列表（双打赛事）
router.get('/:id/available-partners', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.query;

    // 检查赛事是否存在且是双打
    const [events] = await pool.query('SELECT * FROM events WHERE id = ?', [id]);
    if (events.length === 0) {
      return res.status(404).json({ success: false, message: '赛事不存在' });
    }

    const event = events[0];
    if (event.event_type !== 'doubles') {
      return res.status(400).json({ success: false, message: '该赛事不是双打赛事' });
    }

    // 获取等待配对的用户（status = 'waiting_partner' 且没有搭档）
    const [partners] = await pool.query(`
      SELECT u.id, u.name, u.avatar_url, u.points, u.gender,
             s.name as school_name, c.name as college_name
      FROM event_registrations er
      JOIN users u ON er.user_id = u.id
      LEFT JOIN schools s ON u.school_id = s.id
      LEFT JOIN colleges c ON u.college_id = c.id
      WHERE er.event_id = ?
        AND er.status = 'waiting_partner'
        AND er.partner_id IS NULL
        AND er.user_id != ?
      ORDER BY u.points DESC, u.name
    `, [id, user_id || 0]);

    res.json({ success: true, data: partners });
  } catch (error) {
    console.error('获取可选搭档失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 报名赛事
router.post('/:id/register', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, partner_id, team_name } = req.body;

    if (!user_id) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }

    // 检查赛事是否存在
    const [events] = await pool.query(
      'SELECT e.*, (SELECT COUNT(*) FROM event_registrations WHERE event_id = e.id AND status != "cancelled") as participant_count FROM events e WHERE e.id = ?',
      [id]
    );

    if (events.length === 0) {
      return res.status(400).json({ success: false, message: '赛事不存在' });
    }

    const event = events[0];
    
    // 检查赛事状态
    if (event.status === 'draft') {
      return res.status(400).json({ success: false, message: '赛事尚未发布' });
    }
    if (event.status === 'cancelled') {
      return res.status(400).json({ success: false, message: '赛事已取消' });
    }
    if (event.status === 'finished') {
      return res.status(400).json({ success: false, message: '赛事已结束' });
    }
    
    // 检查报名截止时间
    if (event.registration_end && new Date() > new Date(event.registration_end)) {
      return res.status(400).json({ success: false, message: '报名已截止' });
    }
    
    // 检查人数限制
    if (event.max_participants && event.participant_count >= event.max_participants) {
      return res.status(400).json({ success: false, message: '报名人数已满' });
    }

    // 检查是否已报名
    const [existing] = await pool.query(
      'SELECT * FROM event_registrations WHERE event_id = ? AND user_id = ? AND status != "cancelled"',
      [id, user_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: '已报名该赛事' });
    }

    // 根据赛事类型处理报名
    let status = 'confirmed';
    let partnerStatus = null;

    if (event.event_type === 'doubles') {
      if (partner_id) {
        status = 'pending';
        partnerStatus = 'pending';
      } else {
        status = 'waiting_partner';
      }
    }

    const [result] = await pool.execute(
      `INSERT INTO event_registrations
        (event_id, user_id, partner_id, partner_status, team_name, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, user_id, partner_id || null, partnerStatus, team_name || null, status]
    );

    // 如果是双打且有搭档，创建组队邀请记录
    if (event.event_type === 'doubles' && partner_id) {
      await pool.execute(
        `INSERT INTO team_invitations (event_id, inviter_id, invitee_id, type, status)
         VALUES (?, ?, ?, 'doubles', 'pending')`,
        [id, user_id, partner_id]
      );
    }

    res.json({
      success: true,
      data: {
        registration_id: result.insertId,
        status
      }
    });
  } catch (error) {
    console.error('报名失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 双打报名专用端点
router.post('/:id/register-doubles', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, partner_mode, partner_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }

    if (!partner_mode || !['select', 'wait'].includes(partner_mode)) {
      return res.status(400).json({ success: false, message: '请选择报名模式' });
    }

    // 检查赛事是否存在
    const [events] = await pool.query(
      'SELECT e.*, (SELECT COUNT(*) FROM event_registrations WHERE event_id = e.id AND status != "cancelled") as participant_count FROM events e WHERE e.id = ?',
      [id]
    );

    if (events.length === 0) {
      return res.status(400).json({ success: false, message: '赛事不存在' });
    }

    const event = events[0];

    // 检查是否为双打赛事
    if (event.event_type !== 'doubles') {
      return res.status(400).json({ success: false, message: '该赛事不是双打赛事' });
    }

    // 检查赛事状态
    if (event.status === 'draft') {
      return res.status(400).json({ success: false, message: '赛事尚未发布' });
    }
    if (event.status === 'cancelled') {
      return res.status(400).json({ success: false, message: '赛事已取消' });
    }
    if (event.status === 'finished') {
      return res.status(400).json({ success: false, message: '赛事已结束' });
    }

    // 检查报名截止时间
    if (event.registration_end && new Date() > new Date(event.registration_end)) {
      return res.status(400).json({ success: false, message: '报名已截止' });
    }

    // 检查人数限制
    if (event.max_participants && event.participant_count >= event.max_participants) {
      return res.status(400).json({ success: false, message: '报名人数已满' });
    }

    // 检查是否已报名
    const [existing] = await pool.query(
      'SELECT * FROM event_registrations WHERE event_id = ? AND user_id = ? AND status != "cancelled"',
      [id, user_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: '已报名该赛事' });
    }

    // 检查是否有已取消的记录（唯一键冲突处理）
    const [cancelled] = await pool.query(
      'SELECT id FROM event_registrations WHERE event_id = ? AND user_id = ? AND status = "cancelled"',
      [id, user_id]
    );
    const hasCancelledRecord = cancelled.length > 0;

    let status, partnerStatus;

    if (partner_mode === 'select') {
      // 指定搭档模式
      if (!partner_id) {
        return res.status(400).json({ success: false, message: '请选择搭档' });
      }

      // 检查搭档是否存在且处于等待配对状态
      const [partnerReg] = await pool.query(
        'SELECT * FROM event_registrations WHERE event_id = ? AND user_id = ? AND status = "waiting_partner"',
        [id, partner_id]
      );

      if (partnerReg.length === 0) {
        return res.status(400).json({ success: false, message: '所选搭档不在配对队列中' });
      }

      // 创建报名记录，状态为 pending（等待搭档确认）
      status = 'pending';
      partnerStatus = 'pending';

      if (hasCancelledRecord) {
        await pool.execute(
          `UPDATE event_registrations
           SET partner_id = ?, partner_status = ?, status = ?, team_name = NULL, is_team_leader = 0, team_leader_id = NULL
           WHERE event_id = ? AND user_id = ?`,
          [partner_id, partnerStatus, status, id, user_id]
        );
      } else {
        await pool.execute(
          `INSERT INTO event_registrations
            (event_id, user_id, partner_id, partner_status, status)
           VALUES (?, ?, ?, ?, ?)`,
          [id, user_id, partner_id, partnerStatus, status]
        );
      }

      // 更新搭档的记录，关联到当前用户
      await pool.execute(
        `UPDATE event_registrations
         SET partner_id = ?, partner_status = 'pending', status = 'pending'
         WHERE event_id = ? AND user_id = ? AND status = 'waiting_partner'`,
        [user_id, id, partner_id]
      );

      // 创建组队邀请记录
      await pool.execute(
        `INSERT INTO team_invitations (event_id, inviter_id, invitee_id, type, status)
         VALUES (?, ?, ?, 'doubles', 'pending')`,
        [id, user_id, partner_id]
      );

      res.json({
        success: true,
        message: '已向搭档发送组队邀请',
        data: { status: 'pending' }
      });

    } else {
      // 等待配对模式
      status = 'waiting_partner';

      if (hasCancelledRecord) {
        await pool.execute(
          `UPDATE event_registrations
           SET status = ?, partner_id = NULL, partner_status = NULL, team_name = NULL, is_team_leader = 0, team_leader_id = NULL
           WHERE event_id = ? AND user_id = ?`,
          [status, id, user_id]
        );
      } else {
        await pool.execute(
          `INSERT INTO event_registrations
            (event_id, user_id, status)
           VALUES (?, ?, ?)`,
          [id, user_id, status]
        );
      }

      res.json({
        success: true,
        message: '已加入配对队列',
        data: { status: 'waiting_partner' }
      });
    }

  } catch (error) {
    console.error('双打报名失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 取消报名
router.post('/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    // 获取当前报名记录，检查是否有搭档
    const [registrations] = await pool.query(
      'SELECT * FROM event_registrations WHERE event_id = ? AND user_id = ? AND status != "cancelled"',
      [id, user_id]
    );

    if (registrations.length === 0) {
      return res.status(400).json({ success: false, message: '未找到报名记录' });
    }

    const registration = registrations[0];
    const partnerId = registration.partner_id;

    // 取消自己的报名
    await pool.execute(
      'UPDATE event_registrations SET status = "cancelled" WHERE event_id = ? AND user_id = ?',
      [id, user_id]
    );

    // 如果有搭档，重置搭档状态为 waiting_partner 并清除搭档关联
    if (partnerId) {
      await pool.execute(
        `UPDATE event_registrations
         SET status = "waiting_partner", partner_id = NULL, partner_status = NULL
         WHERE event_id = ? AND user_id = ? AND status != "cancelled"`,
        [id, partnerId]
      );

      // 同时取消相关的组队邀请
      await pool.execute(
        `UPDATE team_invitations SET status = "expired"
         WHERE event_id = ? AND ((inviter_id = ? AND invitee_id = ?) OR (inviter_id = ? AND invitee_id = ?)) AND status = "pending"`,
        [id, user_id, partnerId, partnerId, user_id]
      );
    }

    res.json({ success: true, message: '已取消报名' });
  } catch (error) {
    console.error('取消报名失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取对阵列表
router.get('/:id/matches', async (req, res) => {
  try {
    const { id } = req.params;

    const [matches] = await pool.query(`
      SELECT m.*,
        u1.name as player1_name, u1.avatar_url as player1_avatar,
        u2.name as player2_name, u2.avatar_url as player2_avatar
      FROM matches m
      LEFT JOIN users u1 ON m.player1_id = u1.id
      LEFT JOIN users u2 ON m.player2_id = u2.id
      WHERE m.event_id = ?
      ORDER BY m.round, m.match_order
    `, [id]);

    res.json({ success: true, data: matches });
  } catch (error) {
    console.error('获取对阵列表失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

/**
 * 更新选手积分
 * @param {number} eventId - 赛事ID
 * @param {number} matchId - 比赛ID
 * @param {number} winnerId - 胜者ID
 * @param {number} loserId - 败者ID
 */
async function updatePlayerRatings(eventId, matchId, winnerId, loserId) {
  try {
    // 获取双方当前积分
    const [players] = await pool.query(
      'SELECT id, points FROM users WHERE id IN (?, ?)',
      [winnerId, loserId]
    );

    if (players.length !== 2) {
      console.error('无法找到比赛双方选手');
      return;
    }

    const winnerData = players.find(p => p.id === winnerId);
    const loserData = players.find(p => p.id === loserId);

    const winnerPoints = winnerData.points || 0;
    const loserPoints = loserData.points || 0;

    // 计算积分变化
    const result = calculateMatchRating(winnerPoints, loserPoints);

    // 开启事务
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // 更新胜者积分
      await connection.execute(
        'UPDATE users SET points = ?, wins = wins + 1 WHERE id = ?',
        [result.newWinnerPoints, winnerId]
      );

      // 更新败者积分
      await connection.execute(
        'UPDATE users SET points = ?, losses = losses + 1 WHERE id = ?',
        [result.newLoserPoints, loserId]
      );

      // 记录胜者积分历史
      await connection.execute(
        `INSERT INTO rating_history
          (user_id, points_before, points_after, points_change, source_type, match_id, event_id, opponent_id, opponent_points, is_winner, remark)
         VALUES (?, ?, ?, ?, 'match', ?, ?, ?, ?, 1, ?)`,
        [
          winnerId, winnerPoints, result.newWinnerPoints, result.winnerChange,
          matchId, eventId, loserId, loserPoints,
          result.isUpset ? '爆冷获胜' : '正常获胜'
        ]
      );

      // 记录败者积分历史
      await connection.execute(
        `INSERT INTO rating_history
          (user_id, points_before, points_after, points_change, source_type, match_id, event_id, opponent_id, opponent_points, is_winner, remark)
         VALUES (?, ?, ?, ?, 'match', ?, ?, ?, ?, 0, ?)`,
        [
          loserId, loserPoints, result.newLoserPoints, result.loserChange,
          matchId, eventId, winnerId, winnerPoints,
          result.isUpset ? '爆冷失利' : '正常失利'
        ]
      );

      await connection.commit();
      console.log(`积分已更新: 胜者${winnerId}(${winnerPoints}→${result.newWinnerPoints}), 败者${loserId}(${loserPoints}→${result.newLoserPoints})`);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('更新积分失败:', error);
    // 积分更新失败不影响比赛确认结果
  }
}

// ============ 领队申请 ============

// 申请成为领队
router.post('/:id/apply-captain', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, reason, is_participating } = req.body;
    const leaderParticipating = (is_participating === 0 || is_participating === '0' || is_participating === false) ? 0 : 1;

    if (!user_id) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }

    // 检查赛事是否存在且是团体赛
    const [events] = await pool.query('SELECT * FROM events WHERE id = ?', [id]);
    if (events.length === 0) {
      return res.status(404).json({ success: false, message: '赛事不存在' });
    }

    const event = events[0];
    if (event.event_type !== 'team') {
      return res.status(400).json({ success: false, message: '只有团体赛需要领队' });
    }

    // 检查是否已申请过
    const [existing] = await pool.query(
      'SELECT * FROM captain_applications WHERE event_id = ? AND user_id = ?',
      [id, user_id]
    );
    if (existing.length > 0) {
      const app = existing[0];
      if (app.status === 'pending') {
        return res.status(400).json({ success: false, message: '已提交申请，请等待审批' });
      }
      if (app.status === 'approved') {
        return res.status(400).json({ success: false, message: '您已是该赛事的领队' });
      }
      // 如果之前被拒绝，可以重新申请
      await pool.execute(
        'UPDATE captain_applications SET status = ?, reason = ?, is_participating = ?, reject_reason = NULL, reviewed_by = NULL, reviewed_at = NULL WHERE id = ?',
        ['pending', reason || null, leaderParticipating, app.id]
      );
    } else {
      await pool.execute(
        'INSERT INTO captain_applications (event_id, user_id, reason, is_participating) VALUES (?, ?, ?, ?)',
        [id, user_id, reason || null, leaderParticipating]
      );
    }

    res.json({ success: true, message: '申请已提交，请等待审批' });
  } catch (error) {
    console.error('申请领队失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取我的领队申请
router.get('/captain-applications/my', async (req, res) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }

    const [applications] = await pool.query(`
      SELECT ca.*, e.title as event_title, e.event_type, e.event_start, e.location
      FROM captain_applications ca
      JOIN events e ON ca.event_id = e.id
      WHERE ca.user_id = ?
      ORDER BY ca.created_at DESC
    `, [user_id]);

    res.json({ success: true, data: applications });
  } catch (error) {
    console.error('获取领队申请失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 检查用户是否是某赛事的领队
router.get('/:id/captain-status', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.query;

    if (!user_id) {
      return res.json({
        success: true,
        data: {
          isCaptain: false,
          application: null,
          canManageTeam: false,
          canViewTeam: false,
          teamRole: null,
          teamName: '',
          teamSubmitted: false
        }
      });
    }

    const [applications] = await pool.query(
      'SELECT * FROM captain_applications WHERE event_id = ? AND user_id = ?',
      [id, user_id]
    );
    const teamContext = await getUserTeamContext(id, user_id);
    const application = applications[0] || null;
    const canManageTeam = application?.status === 'approved';
    const canViewTeam = canManageTeam || !!teamContext.registration;
    const leaderReg = teamContext.leaderReg;

    res.json({
      success: true,
      data: {
        isCaptain: canManageTeam,
        application,
        canManageTeam,
        canViewTeam,
        teamRole: canManageTeam ? 'leader' : teamContext.viewerRole,
        teamName: leaderReg?.team_name || teamContext.registration?.team_name || '',
        teamSubmitted: !!(leaderReg && (leaderReg.team_submit_status || 'submitted') === 'submitted')
      }
    });
  } catch (error) {
    console.error('获取领队状态失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ============ 团体赛报名 ============

// 团体赛邀请队员（领队发送邀请）
router.post('/team/invite', async (req, res) => {
  try {
    const { event_id, inviter_id, invitee_id, position } = req.body;

    if (!event_id || !inviter_id || !invitee_id) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }

    // 检查赛事是否存在且是团体赛
    const [events] = await pool.query('SELECT * FROM events WHERE id = ?', [event_id]);
    if (events.length === 0) {
      return res.status(404).json({ success: false, message: '赛事不存在' });
    }

    const event = events[0];
    if (event.event_type !== 'team') {
      return res.status(400).json({ success: false, message: '该赛事不是团体赛' });
    }

    // 检查邀请者是否是已审批的领队
    const [captainApp] = await pool.query(
      'SELECT * FROM captain_applications WHERE event_id = ? AND user_id = ? AND status = "approved"',
      [event_id, inviter_id]
    );
    if (captainApp.length === 0) {
      return res.status(400).json({ success: false, message: '只有已审批的领队才能邀请队员' });
    }

    // 检查被邀请者是否已被邀请或已报名
    const [existingInvite] = await pool.query(
      'SELECT * FROM team_invitations WHERE event_id = ? AND invitee_id = ? AND status = "pending"',
      [event_id, invitee_id]
    );
    if (existingInvite.length > 0) {
      return res.status(400).json({ success: false, message: '该用户已有待处理的邀请' });
    }

    const [existingReg] = await pool.query(
      'SELECT * FROM event_registrations WHERE event_id = ? AND user_id = ? AND status != "cancelled"',
      [event_id, invitee_id]
    );
    if (existingReg.length > 0) {
      return res.status(400).json({ success: false, message: '该用户已报名此赛事' });
    }

    // 创建邀请记录
    await pool.query(
      `INSERT INTO team_invitations (event_id, inviter_id, invitee_id, type, status, message)
       VALUES (?, ?, ?, 'team', 'pending', ?)`,
      [event_id, inviter_id, invitee_id, position ? `位置: ${position}` : null]
    );

    // 通知被邀请的队员
    try {
      const [inviterUser] = await pool.query('SELECT name FROM users WHERE id = ?', [inviter_id]);
      const [inviteeUser] = await pool.query('SELECT openid FROM users WHERE id = ?', [invitee_id]);
      const [leaderReg] = await pool.query(
        'SELECT team_name FROM event_registrations WHERE event_id = ? AND user_id = ? AND is_team_leader = 1',
        [event_id, inviter_id]
      );

      if (inviteeUser[0]?.openid) {
        await subscribeMessage.sendTeamInvitation(inviteeUser[0].openid, {
          inviterName: inviterUser[0]?.name || '领队',
          teamName: leaderReg[0]?.team_name || '队伍',
          eventName: event.title,
          time: subscribeMessage.formatTime(new Date()),
          page: `pages/my-events/my-events`
        });
      }
    } catch (notifyError) {
      console.error('发送团体赛邀请通知失败:', notifyError);
    }

    res.json({ success: true, message: '邀请已发送' });
  } catch (error) {
    console.error('发送团队邀请失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 团体赛报名（领队组建队伍）
router.get('/team-invitations/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { user_id } = req.query;

    const [rows] = await pool.query(
      `SELECT i.*,
              e.title as event_title,
              e.location as event_location,
              inviter.name as inviter_name,
              inviter.avatar_url as inviter_avatar_url,
              invitee.name as invitee_name
       FROM team_invitations i
       JOIN events e ON i.event_id = e.id
       JOIN users inviter ON i.inviter_id = inviter.id
       LEFT JOIN users invitee ON i.invitee_id = invitee.id
       WHERE i.invite_token = ?
         AND i.type = 'team'
       LIMIT 1`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '邀请不存在或已失效' });
    }

    const invitation = rows[0];
    const event = await getEventById(invitation.event_id);
    const leaderReg = await getLeaderRegistration(invitation.event_id, invitation.inviter_id);
    const responderEligibility = user_id
      ? await getTeamInvitationResponderEligibility(invitation, user_id)
      : { canRespond: null, message: '' };

    if (!event || event.event_type !== 'team') {
      return res.status(404).json({ success: false, message: '赛事不存在' });
    }

    res.json({
      success: true,
      data: {
        id: invitation.id,
        event_id: invitation.event_id,
        invite_token: invitation.invite_token,
        status: invitation.status,
        inviter_id: invitation.inviter_id,
        inviter_name: invitation.inviter_name,
        inviter_avatar_url: invitation.inviter_avatar_url,
        invitee_id: invitation.invitee_id,
        invitee_name: invitation.invitee_name || '',
        response_allowed: responderEligibility.canRespond,
        response_block_reason: responderEligibility.message || '',
        team_name: leaderReg && leaderReg.status !== 'cancelled' ? (leaderReg.team_name || '') : '',
        event: {
          id: event.id,
          title: event.title,
          location: event.location,
          status: computeEventStatus(event),
          registration_end: event.registration_end,
          event_start: event.event_start
        }
      }
    });
  } catch (error) {
    console.error('获取团体赛邀请详情失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/team-invitations/:token/respond', async (req, res) => {
  try {
    const { token } = req.params;
    const { user_id, action } = req.body;

    if (!user_id) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }
    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: '无效操作' });
    }

    const [invitationRows] = await pool.query(
      `SELECT i.*,
              e.title as event_title,
              e.location as event_location,
              inviter.name as inviter_name,
              inviter.openid as inviter_openid
       FROM team_invitations i
       JOIN events e ON i.event_id = e.id
       JOIN users inviter ON i.inviter_id = inviter.id
       WHERE i.invite_token = ?
         AND i.type = 'team'
       LIMIT 1`,
      [token]
    );

    if (invitationRows.length === 0) {
      return res.status(404).json({ success: false, message: '邀请不存在或已失效' });
    }

    const invitation = invitationRows[0];
    if (invitation.status !== 'pending') {
      return res.status(400).json({ success: false, message: '该邀请已处理' });
    }
    const eligibility = await getTeamInvitationResponderEligibility(invitation, user_id);
    if (!eligibility.canRespond) {
      return res.status(400).json({ success: false, message: eligibility.message });
    }

    const currentUser = eligibility.user;

    if (action === 'accept') {
      const event = await getEventById(invitation.event_id);
      if (!event || event.event_type !== 'team') {
        return res.status(404).json({ success: false, message: '赛事不存在' });
      }
      if (computeEventStatus(event) !== 'registration') {
        return res.status(400).json({ success: false, message: '赛事已不在报名阶段' });
      }

      const leaderReg = await getLeaderRegistration(invitation.event_id, invitation.inviter_id);
      if (!leaderReg || leaderReg.status === 'cancelled' || (leaderReg.team_submit_status || 'submitted') !== 'draft') {
        return res.status(400).json({ success: false, message: '该邀请已失效' });
      }

      const [existingReg] = await pool.query(
        'SELECT * FROM event_registrations WHERE event_id = ? AND user_id = ? AND status != "cancelled"',
        [invitation.event_id, user_id]
      );
      if (existingReg.length > 0) {
        return res.status(400).json({ success: false, message: '您已报名该赛事' });
      }

      const teamMembers = await getTeamMembers(invitation.event_id, invitation.inviter_id);
      const actualParticipants = teamMembers.filter((member) => {
        if (member.is_team_leader) {
          return member.is_participating !== 0;
        }
        return true;
      });
      const config = normalizeTeamEventConfig(event);
      const maleCount = actualParticipants.filter((member) => member.gender === 'male').length;
      const femaleCount = actualParticipants.filter((member) => member.gender === 'female').length;

      if (config.genderRule === 'male_only' && currentUser.gender !== 'male') {
        return res.status(400).json({ success: false, message: '该赛事仅允许男子团体报名' });
      }
      if (config.genderRule === 'female_only' && currentUser.gender !== 'female') {
        return res.status(400).json({ success: false, message: '该赛事仅允许女子团体报名' });
      }
      if (false && config.genderRule === 'fixed') {
        if (currentUser.gender === 'male' && maleCount >= config.requiredMaleCount) {
          return res.status(400).json({ success: false, message: '当前队伍男生人数已达上限' });
        }
        if (currentUser.gender === 'female' && femaleCount >= config.requiredFemaleCount) {
          return res.status(400).json({ success: false, message: '当前队伍女生人数已达上限' });
        }
      }

      const connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        const [historyRows] = await connection.query(
          'SELECT * FROM event_registrations WHERE event_id = ? AND user_id = ? LIMIT 1',
          [invitation.event_id, user_id]
        );

        if (historyRows.length > 0) {
          await connection.execute(
            `UPDATE event_registrations
             SET team_name = ?,
                 is_team_leader = 0,
                 team_leader_id = ?,
                 is_participating = 1,
                 is_singles_player = 0,
                 status = 'confirmed',
                 team_submit_status = 'draft',
                 team_submitted_at = NULL,
                 partner_id = NULL,
                 partner_status = NULL,
                 confirmed_at = NOW()
             WHERE id = ?`,
            [leaderReg.team_name, invitation.inviter_id, historyRows[0].id]
          );
        } else {
          await connection.execute(
            `INSERT INTO event_registrations (
              event_id, user_id, team_name, is_team_leader, team_leader_id,
              is_participating, is_singles_player, status, team_submit_status,
              team_submitted_at, confirmed_at
            ) VALUES (?, ?, ?, 0, ?, 1, 0, 'confirmed', 'draft', NULL, NOW())`,
            [invitation.event_id, user_id, leaderReg.team_name, invitation.inviter_id]
          );
        }

        await connection.execute(
          `UPDATE team_invitations
           SET invitee_id = ?, status = 'accepted', responded_at = NOW()
           WHERE id = ?`,
          [user_id, invitation.id]
        );

        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } else {
      await pool.execute(
        `UPDATE team_invitations
         SET invitee_id = ?, status = 'rejected', responded_at = NOW()
         WHERE id = ?`,
        [user_id, invitation.id]
      );
    }

    // 通知领队：队员接受/拒绝了邀请
    if (invitation.inviter_openid) {
      try {
        const leaderReg = await getLeaderRegistration(invitation.event_id, invitation.inviter_id);
        await subscribeMessage.sendTeamInvitationResult(invitation.inviter_openid, {
          memberName: currentUser.name,
          teamName: leaderReg?.team_name || '队伍',
          status: action === 'accept' ? '已接受' : '已拒绝',
          time: subscribeMessage.formatTime(new Date()),
          page: `pages/team-register/team-register?id=${invitation.event_id}`
        });
      } catch (notifyError) {
        console.error('发送团体赛邀请结果通知失败:', notifyError);
      }
    }

    res.json({
      success: true,
      message: action === 'accept' ? '已加入队伍' : '已拒绝邀请'
    });
  } catch (error) {
    console.error('处理团体赛邀请失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/:id/team-draft', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, team_name, leader_participating } = req.body;
    const normalizedTeamName = (team_name || '').trim();

    if (!user_id) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }
    if (!normalizedTeamName) {
      return res.status(400).json({ success: false, message: '请先填写队伍名称' });
    }

    const event = await getEventById(id);
    if (!event) {
      return res.status(404).json({ success: false, message: '赛事不存在' });
    }
    if (event.event_type !== 'team') {
      return res.status(400).json({ success: false, message: '该赛事不是团体赛' });
    }
    if (computeEventStatus(event) !== 'registration') {
      return res.status(400).json({ success: false, message: '赛事已不在报名阶段' });
    }

    const captainApp = await getCaptainApplication(id, user_id);
    if (!captainApp || captainApp.status !== 'approved') {
      return res.status(403).json({ success: false, message: '只有已审核通过的领队才能组队' });
    }

    const [duplicateTeam] = await pool.query(
      `SELECT id
       FROM event_registrations
       WHERE event_id = ?
         AND is_team_leader = 1
         AND user_id != ?
         AND status != 'cancelled'
         AND team_name = ?
       LIMIT 1`,
      [id, user_id, normalizedTeamName]
    );
    if (duplicateTeam.length > 0) {
      return res.status(400).json({ success: false, message: '队伍名称已存在' });
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      await upsertLeaderDraft(connection, {
        eventId: id,
        leaderId: user_id,
        teamName: normalizedTeamName,
        leaderParticipating: leader_participating === 0 || leader_participating === false ? 0 : 1
      });

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const leaderReg = await getLeaderRegistration(id, user_id);
    const members = await getTeamMembers(id, user_id);
    const pendingInvitations = await getPendingTeamInvitations(id, user_id);
    const occupiedSlots = members.filter((member) => {
      if (member.is_team_leader) {
        return member.is_participating !== 0;
      }
      return true;
    }).length + pendingInvitations.length;

    res.json({
      success: true,
      message: '队伍草稿已保存',
      data: {
        team_name: leaderReg ? leaderReg.team_name : normalizedTeamName,
        leader_participating: leaderReg ? leaderReg.is_participating !== 0 : leader_participating !== 0,
        occupied_slots: occupiedSlots,
        members,
        pending_invitations: pendingInvitations
      }
    });
  } catch (error) {
    console.error('保存团体赛草稿失败:', error);
    const message = error.message === '队伍已正式提交，不能再修改' ? error.message : '服务器错误';
    res.status(message === '服务器错误' ? 500 : 400).json({ success: false, message });
  }
});

router.post('/:id/team-invitations', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, team_name, leader_participating } = req.body;
    const normalizedTeamName = (team_name || '').trim();

    if (!user_id) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }
    if (!normalizedTeamName) {
      return res.status(400).json({ success: false, message: '请先填写队伍名称，再邀请队员' });
    }

    const event = await getEventById(id);
    if (!event) {
      return res.status(404).json({ success: false, message: '赛事不存在' });
    }
    if (event.event_type !== 'team') {
      return res.status(400).json({ success: false, message: '该赛事不是团体赛' });
    }
    if (computeEventStatus(event) !== 'registration') {
      return res.status(400).json({ success: false, message: '赛事已不在报名阶段' });
    }

    const captainApp = await getCaptainApplication(id, user_id);
    if (!captainApp || captainApp.status !== 'approved') {
      return res.status(403).json({ success: false, message: '只有已审核通过的领队才能邀请队员' });
    }

    const [duplicateTeam] = await pool.query(
      `SELECT id
       FROM event_registrations
       WHERE event_id = ?
         AND is_team_leader = 1
         AND user_id != ?
         AND status != 'cancelled'
         AND team_name = ?
       LIMIT 1`,
      [id, user_id, normalizedTeamName]
    );
    if (duplicateTeam.length > 0) {
      return res.status(400).json({ success: false, message: '队伍名称已存在' });
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      await upsertLeaderDraft(connection, {
        eventId: id,
        leaderId: user_id,
        teamName: normalizedTeamName,
        leaderParticipating: leader_participating === 0 || leader_participating === false
          ? 0
          : (captainApp.is_participating === 0 ? 0 : 1)
      });

      const members = await getTeamMembers(id, user_id, connection);
      const pendingInvitations = await getPendingTeamInvitations(id, user_id, connection);
      const config = normalizeTeamEventConfig(event);
      const occupiedSlots = members.filter((member) => {
        if (member.is_team_leader) {
          return member.is_participating !== 0;
        }
        return true;
      }).length + pendingInvitations.length;

      if (occupiedSlots >= config.maxTeamPlayers) {
        throw new Error('已达队伍人数上限，请先删除队员或取消邀请');
      }

      const inviteToken = createInviteToken();
      await connection.execute(
        `INSERT INTO team_invitations (
          event_id, inviter_id, invitee_id, invite_token, type, status
        ) VALUES (?, ?, NULL, ?, 'team', 'pending')`,
        [id, user_id, inviteToken]
      );

      await connection.commit();

      res.json({
        success: true,
        message: '已创建邀请',
        data: {
          invite_token: inviteToken,
          share_path: `/pages/team-invite/team-invite?token=${inviteToken}`
        }
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('创建团体赛邀请失败:', error);
    const message = error.message || '服务器错误';
    res.status(message === '服务器错误' ? 500 : 400).json({ success: false, message });
  }
});

router.post('/:id/team-invitations/:invitationId/cancel', async (req, res) => {
  try {
    const { id, invitationId } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }

    const leaderReg = await getLeaderRegistration(id, user_id);
    if (!leaderReg || leaderReg.status === 'cancelled') {
      return res.status(403).json({ success: false, message: '您不是该赛事的领队' });
    }
    if ((leaderReg.team_submit_status || 'submitted') !== 'draft') {
      return res.status(400).json({ success: false, message: '队伍已正式提交，不能再取消邀请' });
    }

    const [rows] = await pool.query(
      `SELECT i.*, u.openid as invitee_openid
       FROM team_invitations i
       LEFT JOIN users u ON i.invitee_id = u.id
       WHERE i.id = ?
         AND i.event_id = ?
         AND i.inviter_id = ?
         AND i.type = 'team'
         AND i.status = 'pending'
       LIMIT 1`,
      [invitationId, id, user_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '待处理邀请不存在' });
    }

    const invitation = rows[0];
    await pool.execute(
      `UPDATE team_invitations
       SET status = 'cancelled', responded_at = NOW()
       WHERE id = ?`,
      [invitationId]
    );

    // 通知被邀请的队员：邀请已被取消
    if (invitation.invitee_openid) {
      try {
        await subscribeMessage.sendTeamInvitationResult(invitation.invitee_openid, {
          memberName: '您',
          teamName: leaderReg.team_name || '队伍',
          status: '已取消',
          time: subscribeMessage.formatTime(new Date()),
          page: `pages/events/event-detail?id=${id}`
        });
      } catch (notifyError) {
        console.error('发送取消邀请通知失败:', notifyError);
      }
    }

    res.json({ success: true, message: '已取消邀请' });
  } catch (error) {
    console.error('取消团体赛邀请失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/:id/team-members/:memberId/remove', async (req, res) => {
  try {
    const { id, memberId } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }
    if (parseInt(memberId, 10) === parseInt(user_id, 10)) {
      return res.status(400).json({ success: false, message: '领队不能删除自己，请直接取消队伍报名' });
    }

    const leaderReg = await getLeaderRegistration(id, user_id);
    if (!leaderReg || leaderReg.status === 'cancelled') {
      return res.status(403).json({ success: false, message: '您不是该赛事的领队' });
    }
    if ((leaderReg.team_submit_status || 'submitted') !== 'draft') {
      return res.status(400).json({ success: false, message: '队伍已正式提交，不能再删除队员' });
    }

    const [rows] = await pool.query(
      `SELECT er.id, er.user_id, u.openid
       FROM event_registrations er
       JOIN users u ON er.user_id = u.id
       WHERE er.event_id = ?
         AND er.user_id = ?
         AND er.team_leader_id = ?
         AND er.status != 'cancelled'
       LIMIT 1`,
      [id, memberId, user_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '队员不存在' });
    }

    await pool.execute(
      `UPDATE event_registrations
       SET status = 'cancelled',
            is_singles_player = 0
       WHERE id = ?`,
      [rows[0].id]
    );

    const [acceptedInvitations] = await pool.query(
      `SELECT id
       FROM team_invitations
       WHERE event_id = ?
         AND inviter_id = ?
         AND invitee_id = ?
         AND type = 'team'
         AND status = 'accepted'
       ORDER BY responded_at DESC, id DESC
       LIMIT 1`,
      [id, user_id, memberId]
    );

    if (acceptedInvitations.length > 0) {
      await pool.execute(
        `UPDATE team_invitations
         SET status = 'removed', responded_at = NOW()
         WHERE id = ?`,
        [acceptedInvitations[0].id]
      );
    }

    // 通知被删除的队员
    if (leaderReg.team_name) {
      await pool.execute(
        `UPDATE team_project_assignments
         SET player_a_id = CASE WHEN player_a_id = ? THEN NULL ELSE player_a_id END,
             player_b_id = CASE WHEN player_b_id = ? THEN NULL ELSE player_b_id END
         WHERE event_id = ?
           AND team_name = ?
           AND (player_a_id = ? OR player_b_id = ?)`,
        [memberId, memberId, id, leaderReg.team_name, memberId, memberId]
      );

      await pool.execute(
        `DELETE FROM team_project_assignments
         WHERE event_id = ?
           AND team_name = ?
           AND player_a_id IS NULL
           AND player_b_id IS NULL`,
        [id, leaderReg.team_name]
      );
    }

    if (rows[0].openid) {
      try {
        await subscribeMessage.sendTeamInvitationResult(rows[0].openid, {
          memberName: '您',
          teamName: leaderReg.team_name || '队伍',
          status: '已移出',
          time: subscribeMessage.formatTime(new Date()),
          page: `pages/events/event-detail?id=${id}`
        });
      } catch (notifyError) {
        console.error('发送移出队员通知失败:', notifyError);
      }
    }

    res.json({ success: true, message: '已删除队员' });
  } catch (error) {
    console.error('删除团体赛队员失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/:id/team-submit', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, team_name } = req.body;
    const normalizedTeamName = (team_name || '').trim();

    if (!user_id) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }
    if (!normalizedTeamName) {
      return res.status(400).json({ success: false, message: '请先填写队伍名称' });
    }

    const event = await getEventById(id);
    if (!event) {
      return res.status(404).json({ success: false, message: '赛事不存在' });
    }
    if (event.event_type !== 'team') {
      return res.status(400).json({ success: false, message: '该赛事不是团体赛' });
    }
    if (computeEventStatus(event) !== 'registration') {
      return res.status(400).json({ success: false, message: '赛事已不在报名阶段' });
    }

    const captainApp = await getCaptainApplication(id, user_id);
    if (!captainApp || captainApp.status !== 'approved') {
      return res.status(403).json({ success: false, message: '只有已审核通过的领队才能提交报名' });
    }

    const [duplicateTeam] = await pool.query(
      `SELECT id
       FROM event_registrations
       WHERE event_id = ?
         AND is_team_leader = 1
         AND user_id != ?
         AND status != 'cancelled'
         AND team_name = ?
       LIMIT 1`,
      [id, user_id, normalizedTeamName]
    );
    if (duplicateTeam.length > 0) {
      return res.status(400).json({ success: false, message: '队伍名称已存在' });
    }

    if (event.max_participants && event.team_count >= event.max_participants) {
      return res.status(400).json({ success: false, message: '参赛队伍数量已满' });
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      await upsertLeaderDraft(connection, {
        eventId: id,
        leaderId: user_id,
        teamName: normalizedTeamName,
        leaderParticipating: captainApp.is_participating === 0 ? 0 : 1
      });

      const leaderReg = await getLeaderRegistration(id, user_id, connection);
      if (!leaderReg || leaderReg.status === 'cancelled') {
        throw new Error('领队信息不存在');
      }
      if ((leaderReg.team_submit_status || 'submitted') === 'submitted') {
        throw new Error('队伍已正式提交，请勿重复报名');
      }

      const pendingInvitations = await getPendingTeamInvitations(id, user_id, connection);
      if (pendingInvitations.length > 0) {
        throw new Error('还有待处理邀请，请先确认或取消后再提交');
      }

      const teamMembers = await getTeamMembers(id, user_id, connection);
      const actualParticipants = teamMembers.filter((member) => {
        if (member.is_team_leader) {
          return member.is_participating !== 0;
        }
        return true;
      });

      const participantValidation = validateTeamSubmitParticipants(event, actualParticipants);
      if (!participantValidation.valid) {
        throw new Error(participantValidation.errors[0]);
      }

      const projectAssignments = await getTeamProjectAssignments(id, normalizedTeamName, connection);
      const sanitizedProjectAssignments = sanitizeTeamProjectAssignments(projectAssignments, actualParticipants).assignments;
      const projectValidation = validateTeamProjectAssignmentsForSubmit({
        teamProjectConfig: event.team_event_config,
        participants: actualParticipants,
        assignments: sanitizedProjectAssignments,
        requireComplete: false
      });
      if (!projectValidation.valid) {
        throw new Error(projectValidation.errors[0]);
      }

      await connection.execute(
        `UPDATE event_registrations
         SET team_name = ?,
             team_submit_status = 'submitted',
             team_submitted_at = NOW(),
             status = 'confirmed',
             confirmed_at = COALESCE(confirmed_at, NOW()),
             is_singles_player = 0
         WHERE event_id = ?
           AND status != 'cancelled'
           AND (
             (is_team_leader = 1 AND user_id = ?)
             OR (is_team_leader = 0 AND team_leader_id = ?)
           )`,
        [normalizedTeamName, id, user_id, user_id]
      );

      if (projectValidation.singlesPlayerIds.length > 0) {
        const placeholders = projectValidation.singlesPlayerIds.map(() => '?').join(',');
        await connection.execute(
          `UPDATE event_registrations
           SET is_singles_player = 1
           WHERE event_id = ?
             AND status != 'cancelled'
             AND is_participating = 1
             AND user_id IN (${placeholders})
             AND (
               (is_team_leader = 1 AND user_id = ?)
               OR (is_team_leader = 0 AND team_leader_id = ?)
             )`,
          [id, ...projectValidation.singlesPlayerIds, user_id, user_id]
        );
      }

      await connection.commit();

      // 通知全体队员：报名成功
      try {
        const [allMembers] = await pool.query(
          `SELECT u.openid, u.name
           FROM event_registrations er
           JOIN users u ON er.user_id = u.id
           WHERE er.event_id = ?
             AND er.status != 'cancelled'
             AND (
               (er.is_team_leader = 1 AND er.user_id = ?)
               OR (er.is_team_leader = 0 AND er.team_leader_id = ?)
             )`,
          [id, user_id, user_id]
        );

        const notifyPromises = allMembers
          .filter(member => member.openid)
          .map(member =>
            subscribeMessage.sendTeamRegistrationSuccess(member.openid, {
              teamName: normalizedTeamName,
              eventName: event.title,
              eventTime: subscribeMessage.formatTime(event.event_start),
              page: `pages/my-events/my-events`
            }).catch(err => console.error(`通知队员 ${member.name} 失败:`, err))
          );

        await Promise.all(notifyPromises);
      } catch (notifyError) {
        console.error('发送团体赛报名成功通知失败:', notifyError);
      }

      res.json({
        success: true,
        message: '报名成功，队伍信息已锁定',
        data: {
          team_name: normalizedTeamName,
          actual_player_count: actualParticipants.length,
          submitted_at: new Date().toISOString()
        }
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('团体赛提交报名失败:', error);
    const message = error.message || '服务器错误';
    res.status(message === '服务器错误' ? 500 : 400).json({ success: false, message });
  }
});

router.get('/:id/team-draft-status', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }

    const event = await getEventById(id);
    if (!event) {
      return res.status(404).json({ success: false, message: '赛事不存在' });
    }
    if (event.event_type !== 'team') {
      return res.status(400).json({ success: false, message: '该赛事不是团体赛' });
    }

      const captainApp = await getCaptainApplication(id, user_id);
      const teamContext = await getUserTeamContext(id, user_id);
      const canEdit = captainApp?.status === 'approved';
      const leaderId = teamContext.leaderId || (canEdit ? parseInt(user_id, 10) : null);
      const leaderReg = teamContext.leaderReg || (leaderId ? await getLeaderRegistration(id, leaderId) : null);
      const hasActiveTeam = !!(leaderReg && leaderReg.status !== 'cancelled');
      const members = hasActiveTeam && leaderId
        ? await getTeamMembers(id, leaderId)
        : [];
      const invitations = hasActiveTeam && leaderId
        ? await getTeamInvitations(id, leaderId)
        : [];
      const pendingInvitations = invitations.filter((invitation) => invitation.status === 'pending');
      const config = normalizeTeamEventConfig(event);
      const actualParticipants = members.filter((member) => {
        if (member.is_team_leader) {
          return member.is_participating !== 0;
      }
      return true;
    });
    const occupiedSlots = actualParticipants.length + pendingInvitations.length;

    res.json({
      success: true,
      data: {
        team_name: leaderReg && leaderReg.status !== 'cancelled' ? (leaderReg.team_name || '') : '',
        submitted: !!(leaderReg && leaderReg.status !== 'cancelled' && (leaderReg.team_submit_status || 'submitted') === 'submitted'),
        leader_participating: !!(leaderReg && leaderReg.status !== 'cancelled' && leaderReg.is_participating !== 0),
        can_edit: canEdit,
        viewer_role: canEdit ? 'leader' : teamContext.viewerRole,
        can_view: canEdit || !!teamContext.registration,
        actual_player_count: actualParticipants.length,
        occupied_slots: occupiedSlots,
        members,
        invitations,
        pending_invitations: pendingInvitations,
        config
      }
    });
  } catch (error) {
    console.error('获取团体赛草稿状态失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/:id/team-summary', async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `SELECT er.*,
              u.name,
              u.phone,
              u.gender,
              u.avatar_url,
              s.name as school_name,
              c.name as college_name
       FROM event_registrations er
       JOIN users u ON er.user_id = u.id
       LEFT JOIN schools s ON u.school_id = s.id
       LEFT JOIN colleges c ON u.college_id = c.id
       WHERE er.event_id = ?
         AND er.status != 'cancelled'
         AND er.team_name IS NOT NULL
         AND COALESCE(er.team_submit_status, 'submitted') = 'submitted'
       ORDER BY er.team_submitted_at, er.registered_at, er.id`,
      [id]
    );

    res.json({
      success: true,
      data: buildSubmittedTeamSummaries(rows)
    });
  } catch (error) {
    console.error('获取团体赛队伍汇总失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/:id/register-team', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, team_name, member_ids, singles_player_ids } = req.body;
    // member_ids: 队员用户ID数组（不包含领队自己）
    // singles_player_ids: 参加单打的选手ID数组（可包含领队，最多3人）

    if (!user_id) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }
    if (!team_name) {
      return res.status(400).json({ success: false, message: '请输入队伍名称' });
    }
    if (!member_ids || !Array.isArray(member_ids) || member_ids.length === 0) {
      return res.status(400).json({ success: false, message: '请选择队员' });
    }

    // 检查赛事是否存在且是团体赛
    const [events] = await pool.query(
      'SELECT e.*, (SELECT COUNT(DISTINCT team_name) FROM event_registrations WHERE event_id = e.id AND status != "cancelled" AND team_name IS NOT NULL) as team_count FROM events e WHERE e.id = ?',
      [id]
    );

    if (events.length === 0) {
      return res.status(404).json({ success: false, message: '赛事不存在' });
    }

    const event = events[0];
    if (event.event_type !== 'team') {
      return res.status(400).json({ success: false, message: '该赛事不是团体赛' });
    }

    // 检查赛事状态
    const status = computeEventStatus(event);
    if (status !== 'registration') {
      return res.status(400).json({ success: false, message: '赛事不在报名阶段' });
    }

    // 检查用户是否是已批准的领队
    const [captainApps] = await pool.query(
      'SELECT * FROM captain_applications WHERE event_id = ? AND user_id = ? AND status = "approved"',
      [id, user_id]
    );
    if (captainApps.length === 0) {
      return res.status(403).json({ success: false, message: '您不是该赛事的领队，无法组建队伍' });
    }
    const leaderParticipating = captainApps[0].is_participating === 0 ? 0 : 1;

    // 检查队伍数量限制
    if (event.max_participants && event.team_count >= event.max_participants) {
      return res.status(400).json({ success: false, message: '队伍数量已满' });
    }

    // 检查队伍名称是否重复
    const [existingTeam] = await pool.query(
      'SELECT * FROM event_registrations WHERE event_id = ? AND team_name = ? AND status != "cancelled"',
      [id, team_name]
    );
    if (existingTeam.length > 0) {
      return res.status(400).json({ success: false, message: '队伍名称已存在' });
    }

    // 检查领队是否已报名
    const [leaderReg] = await pool.query(
      'SELECT * FROM event_registrations WHERE event_id = ? AND user_id = ? AND status != "cancelled"',
      [id, user_id]
    );
    if (leaderReg.length > 0) {
      return res.status(400).json({ success: false, message: '您已报名该赛事' });
    }

    const participantCount = member_ids.length + (leaderParticipating ? 1 : 0);
    const config = normalizeTeamEventConfig(event);
    const minParticipants = config.minTeamPlayers;
    if (participantCount < minParticipants) {
      return res.status(400).json({ success: false, message: `当前设置下至少需要${minParticipants}名参赛队员` });
    }

    // 检查队员是否已报名其他队伍
    if (participantCount > config.maxTeamPlayers) {
      return res.status(400).json({ success: false, message: `当前设置下最多只能有${config.maxTeamPlayers}名参赛队员` });
    }

    const [memberRegs] = await pool.query(
      'SELECT er.*, u.name FROM event_registrations er JOIN users u ON er.user_id = u.id WHERE er.event_id = ? AND er.user_id IN (?) AND er.status != "cancelled"',
      [id, member_ids]
    );
    if (memberRegs.length > 0) {
      const names = memberRegs.map(r => r.name).join('、');
      return res.status(400).json({ success: false, message: `以下队员已报名其他队伍：${names}` });
    }

    // 开启事务
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // 计算单打标记
      const singlesIds = (Array.isArray(singles_player_ids) ? singles_player_ids : [])
        .map(v => parseInt(v, 10))
        .filter(v => Number.isInteger(v));
      if (singlesIds.length > 3) {
        return res.status(400).json({ success: false, message: '最多选择3名单打选手' });
      }
      if (!leaderParticipating && singlesIds.includes(parseInt(user_id, 10))) {
        return res.status(400).json({ success: false, message: '领队不参赛时不能标记为单打选手' });
      }

      // 插入领队报名记录
      const leaderIsSingles = leaderParticipating && singlesIds.includes(parseInt(user_id, 10)) ? 1 : 0;
      await connection.execute(
        `INSERT INTO event_registrations (event_id, user_id, team_name, is_team_leader, is_participating, is_singles_player, status)
         VALUES (?, ?, ?, 1, ?, ?, 'confirmed')`,
        [id, user_id, team_name, leaderParticipating, leaderIsSingles]
      );

      // 插入队员报名记录（pending 状态，等待确认）
      for (const memberId of member_ids) {
        const numericMemberId = parseInt(memberId, 10);
        const memberIsSingles = singlesIds.includes(numericMemberId) ? 1 : 0;
        await connection.execute(
          `INSERT INTO event_registrations (event_id, user_id, team_name, is_team_leader, team_leader_id, is_participating, is_singles_player, status)
           VALUES (?, ?, ?, 0, ?, 1, ?, 'pending')`,
          [id, memberId, team_name, user_id, memberIsSingles]
        );

        // 创建团体赛邀请记录
        await connection.execute(
          `INSERT INTO team_invitations (event_id, inviter_id, invitee_id, type, status)
           VALUES (?, ?, ?, 'team', 'pending')`,
          [id, user_id, memberId]
        );
      }

      await connection.commit();

      res.json({
        success: true,
        message: '队伍创建成功，已向队员发送邀请',
        data: {
          team_name,
          leader_id: user_id,
          member_count: participantCount
        }
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('团体赛报名失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取赛事队伍列表（团体赛）
router.get('/:id/teams', async (req, res) => {
  try {
    const { id } = req.params;

    // 获取所有队伍
    const [teams] = await pool.query(`
      SELECT
        er.team_name,
        COUNT(*) as member_count,
        MAX(CASE WHEN er.is_team_leader = 1 THEN er.user_id END) as leader_id,
        MAX(CASE WHEN er.is_team_leader = 1 THEN u.name END) as leader_name,
        MAX(CASE WHEN er.is_team_leader = 1 THEN u.avatar_url END) as leader_avatar
      FROM event_registrations er
      JOIN users u ON er.user_id = u.id
      WHERE er.event_id = ? AND er.status != 'cancelled' AND er.team_name IS NOT NULL
      GROUP BY er.team_name
      ORDER BY MIN(er.registered_at)
    `, [id]);

    // 获取每个队伍的成员
    for (const team of teams) {
      const [members] = await pool.query(`
        SELECT er.user_id, u.name, u.avatar_url, er.is_team_leader, er.is_participating, er.is_singles_player
        FROM event_registrations er
        JOIN users u ON er.user_id = u.id
        WHERE er.event_id = ? AND er.team_name = ? AND er.status != 'cancelled'
        ORDER BY er.is_team_leader DESC, er.registered_at
      `, [id, team.team_name]);
      team.members = members;
    }

    res.json({ success: true, data: teams });
  } catch (error) {
    console.error('获取队伍列表失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 查询领队自己队伍的成员（用于 team-register 页面刷新）
router.get('/:id/my-team', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }

    // 查找领队的队伍名称
    const [leaderReg] = await pool.query(
      'SELECT team_name FROM event_registrations WHERE event_id = ? AND user_id = ? AND is_team_leader = 1 AND status != "cancelled"',
      [id, user_id]
    );

    if (leaderReg.length === 0) {
      // 领队未提交报名，但可能已有成员通过分享链接加入
      const [pendingMembers] = await pool.query(`
        SELECT er.user_id, er.status, er.is_team_leader, er.is_participating, er.is_singles_player,
               u.name, u.avatar_url, u.gender,
               s.name as school_name, c.name as college_name
        FROM event_registrations er
        JOIN users u ON er.user_id = u.id
        LEFT JOIN schools s ON u.school_id = s.id
        LEFT JOIN colleges c ON u.college_id = c.id
        WHERE er.event_id = ? AND er.team_leader_id = ? AND er.status != 'cancelled'
        ORDER BY er.registered_at
      `, [id, user_id]);
      return res.json({ success: true, data: { team_name: null, members: pendingMembers, submitted: false } });
    }

    const teamName = leaderReg[0].team_name;

    // 用 team_name 或 team_leader_id 匹配成员（team_name 为 null 时用 leader_id 兜底）
    let memberSql = `
      SELECT er.user_id, er.status, er.is_team_leader, er.is_participating, er.is_singles_player,
             u.name, u.avatar_url, u.gender,
             s.name as school_name, c.name as college_name
      FROM event_registrations er
      JOIN users u ON er.user_id = u.id
      LEFT JOIN schools s ON u.school_id = s.id
      LEFT JOIN colleges c ON u.college_id = c.id
      WHERE er.event_id = ? AND er.status != 'cancelled'
        AND (er.team_name = ? OR (er.team_leader_id = ? AND er.is_team_leader = 0) OR (er.user_id = ? AND er.is_team_leader = 1))
      ORDER BY er.is_team_leader DESC, er.registered_at
    `;
    const [members] = await pool.query(memberSql, [id, teamName, user_id, user_id]);

    res.json({ success: true, data: { team_name: teamName, members, submitted: !!teamName } });
  } catch (error) {
    console.error('获取我的队伍失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 通过分享链接加入队伍
router.post('/:id/join-team', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, inviter_id } = req.body;

    if (!user_id || !inviter_id) {
      return res.status(400).json({ success: false, message: '缺少参数' });
    }

    // 检查赛事
    const [events] = await pool.query('SELECT * FROM events WHERE id = ?', [id]);
    if (events.length === 0) {
      return res.status(404).json({ success: false, message: '赛事不存在' });
    }
    const event = events[0];
    if (event.event_type !== 'team') {
      return res.status(400).json({ success: false, message: '该赛事不是团体赛' });
    }

    // 检查赛事状态
    const status = computeEventStatus(event);
    if (status !== 'registration') {
      return res.status(400).json({ success: false, message: '赛事不在报名阶段' });
    }

    // 检查邀请人是否为已批准的领队
    const [captainApp] = await pool.query(
      'SELECT * FROM captain_applications WHERE event_id = ? AND user_id = ? AND status = "approved"',
      [id, inviter_id]
    );
    if (captainApp.length === 0) {
      return res.status(400).json({ success: false, message: '邀请人不是该赛事的领队' });
    }

    // 获取领队的队伍信息
    const [leaderReg] = await pool.query(
      'SELECT team_name FROM event_registrations WHERE event_id = ? AND user_id = ? AND is_team_leader = 1 AND status != "cancelled"',
      [id, inviter_id]
    );

    // 领队可能还没提交报名，此时 team_name 可能为空，用领队ID作为临时标识
    const teamName = leaderReg.length > 0 ? leaderReg[0].team_name : null;

    // 检查用户是否已报名
    const [existing] = await pool.query(
      'SELECT * FROM event_registrations WHERE event_id = ? AND user_id = ? AND status != "cancelled"',
      [id, user_id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: '你已报名该赛事' });
    }

    // 检查是否有已取消的记录（唯一键冲突处理）
    const [cancelled] = await pool.query(
      'SELECT id FROM event_registrations WHERE event_id = ? AND user_id = ? AND status = "cancelled"',
      [id, user_id]
    );

    // 创建或更新报名记录
    if (cancelled.length > 0) {
      await pool.execute(
        `UPDATE event_registrations
         SET team_name = ?, is_team_leader = 0, team_leader_id = ?, is_participating = 1, status = 'confirmed',
             partner_id = NULL, partner_status = NULL
         WHERE event_id = ? AND user_id = ?`,
        [teamName, inviter_id, id, user_id]
      );
    } else {
      await pool.execute(
        `INSERT INTO event_registrations (event_id, user_id, team_name, is_team_leader, team_leader_id, is_participating, status)
         VALUES (?, ?, ?, 0, ?, 1, 'confirmed')`,
        [id, user_id, teamName, inviter_id]
      );
    }

    // 创建邀请记录（自动接受）
    await pool.execute(
      `INSERT INTO team_invitations (event_id, inviter_id, invitee_id, type, status, responded_at)
       VALUES (?, ?, ?, 'team', 'accepted', NOW())`,
      [id, inviter_id, user_id]
    );

    res.json({ success: true, message: '已加入队伍' });
  } catch (error) {
    console.error('加入队伍失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 取消团体赛报名（领队取消整个队伍）
router.post('/:id/cancel-team', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }

    // 检查用户是否是该赛事的领队且有队伍
    const [leaderReg] = await pool.query(
      'SELECT team_name FROM event_registrations WHERE event_id = ? AND user_id = ? AND is_team_leader = 1 AND status != "cancelled"',
      [id, user_id]
    );

    if (leaderReg.length === 0) {
      return res.status(403).json({ success: false, message: '您不是该赛事的领队或未组建队伍' });
    }

    const teamName = leaderReg[0].team_name;

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // 取消该队伍所有成员的报名
      await connection.execute(
        'UPDATE event_registrations SET status = "cancelled" WHERE event_id = ? AND team_name = ? AND status != "cancelled"',
        [id, teamName]
      );

      // 将相关团队邀请设为过期
      await connection.execute(
        'UPDATE team_invitations SET status = "expired" WHERE event_id = ? AND inviter_id = ? AND status = "pending"',
        [id, user_id]
      );

      await connection.commit();
      res.json({ success: true, message: '已取消队伍报名' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('取消团体赛报名失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 领队更新队伍单打选手标记
router.put('/:id/team-singles', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, singles_player_ids } = req.body;

    if (!user_id) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }

    if (!Array.isArray(singles_player_ids)) {
      return res.status(400).json({ success: false, message: '参数格式错误' });
    }

    if (singles_player_ids.length > 3) {
      return res.status(400).json({ success: false, message: '最多选择3名单打选手' });
    }
    const singlesIds = singles_player_ids
      .map(v => parseInt(v, 10))
      .filter(v => Number.isInteger(v));

    // 验证是领队
    const [leaderReg] = await pool.query(
      'SELECT team_name, is_participating FROM event_registrations WHERE event_id = ? AND user_id = ? AND is_team_leader = 1 AND status != "cancelled"',
      [id, user_id]
    );
    if (leaderReg.length === 0) {
      return res.status(403).json({ success: false, message: '你不是该赛事的领队' });
    }
    if (leaderReg[0].is_participating === 0 && singlesIds.includes(parseInt(user_id, 10))) {
      return res.status(400).json({ success: false, message: '领队不参赛时不能标记为单打选手' });
    }

    const teamName = leaderReg[0].team_name;

    // 先清除该队伍所有单打标记
    await pool.execute(
      'UPDATE event_registrations SET is_singles_player = 0 WHERE event_id = ? AND team_name = ? AND status != "cancelled"',
      [id, teamName]
    );

    // 设置选中的单打选手
    if (singlesIds.length > 0) {
      const placeholders = singlesIds.map(() => '?').join(',');
      await pool.execute(
        `UPDATE event_registrations SET is_singles_player = 1
         WHERE event_id = ? AND team_name = ? AND user_id IN (${placeholders}) AND status != 'cancelled' AND is_participating = 1`,
        [id, teamName, ...singlesIds]
      );
    }

    res.json({ success: true, message: '已更新单打选手' });
  } catch (error) {
    console.error('更新单打选手失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ============ 赛事排名 ============

// 获取赛事排名（循环赛/淘汰赛）
router.get('/:id/standings', async (req, res) => {
  try {
    const { id } = req.params;

    // 获取赛事信息
    const [events] = await pool.query('SELECT * FROM events WHERE id = ?', [id]);
    if (events.length === 0) {
      return res.status(404).json({ success: false, message: '赛事不存在' });
    }

    const event = events[0];
    let standings = [];

    if (event.format === 'round_robin') {
      // 循环赛排名
      standings = await calculateRoundRobinStandings(id);
    } else if (event.format === 'knockout') {
      // 淘汰赛排名
      standings = await calculateKnockoutStandings(id);
    } else if (event.format === 'group_knockout') {
      // 小组赛+淘汰赛
      standings = await calculateGroupKnockoutStandings(id);
    }

    res.json({ success: true, data: standings });
  } catch (error) {
    console.error('获取赛事排名失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

/**
 * 计算循环赛排名
 * 排名规则：胜场数 > 净胜局 > 净胜分 > 相互战绩
 */
async function calculateRoundRobinStandings(eventId) {
  // 获取所有参赛者
  const [registrations] = await pool.query(`
    SELECT er.user_id, u.name, u.avatar_url
    FROM event_registrations er
    JOIN users u ON er.user_id = u.id
    WHERE er.event_id = ? AND er.status = 'confirmed'
  `, [eventId]);

  // 获取所有已完成的比赛
  const [matches] = await pool.query(`
    SELECT m.*,
      (SELECT SUM(player1_score) FROM match_scores WHERE match_id = m.id) as player1_total_points,
      (SELECT SUM(player2_score) FROM match_scores WHERE match_id = m.id) as player2_total_points
    FROM matches m
    WHERE m.event_id = ? AND m.status = 'finished'
  `, [eventId]);

  // 初始化统计数据
  const stats = {};
  for (const reg of registrations) {
    stats[reg.user_id] = {
      user_id: reg.user_id,
      name: reg.name,
      avatar_url: reg.avatar_url,
      matches_played: 0,
      wins: 0,
      losses: 0,
      games_won: 0,
      games_lost: 0,
      points_won: 0,
      points_lost: 0,
      head_to_head: {} // 相互战绩
    };
  }

  // 统计比赛数据
  for (const match of matches) {
    const p1 = match.player1_id;
    const p2 = match.player2_id;

    if (!stats[p1] || !stats[p2]) continue;

    stats[p1].matches_played++;
    stats[p2].matches_played++;

    stats[p1].games_won += match.player1_games || 0;
    stats[p1].games_lost += match.player2_games || 0;
    stats[p2].games_won += match.player2_games || 0;
    stats[p2].games_lost += match.player1_games || 0;

    stats[p1].points_won += match.player1_total_points || 0;
    stats[p1].points_lost += match.player2_total_points || 0;
    stats[p2].points_won += match.player2_total_points || 0;
    stats[p2].points_lost += match.player1_total_points || 0;

    if (match.winner_id === p1) {
      stats[p1].wins++;
      stats[p2].losses++;
      stats[p1].head_to_head[p2] = (stats[p1].head_to_head[p2] || 0) + 1;
      stats[p2].head_to_head[p1] = (stats[p2].head_to_head[p1] || 0) - 1;
    } else {
      stats[p2].wins++;
      stats[p1].losses++;
      stats[p2].head_to_head[p1] = (stats[p2].head_to_head[p1] || 0) + 1;
      stats[p1].head_to_head[p2] = (stats[p1].head_to_head[p2] || 0) - 1;
    }
  }

  // 转换为数组并排序
  const standings = Object.values(stats);
  standings.sort((a, b) => {
    // 1. 胜场数
    if (b.wins !== a.wins) return b.wins - a.wins;
    // 2. 净胜局
    const aNetGames = a.games_won - a.games_lost;
    const bNetGames = b.games_won - b.games_lost;
    if (bNetGames !== aNetGames) return bNetGames - aNetGames;
    // 3. 净胜分
    const aNetPoints = a.points_won - a.points_lost;
    const bNetPoints = b.points_won - b.points_lost;
    if (bNetPoints !== aNetPoints) return bNetPoints - aNetPoints;
    // 4. 相互战绩
    const h2h = a.head_to_head[b.user_id] || 0;
    return -h2h; // 正数表示a赢b，应该排前面
  });

  // 添加排名
  standings.forEach((s, index) => {
    s.rank = index + 1;
    s.net_games = s.games_won - s.games_lost;
    s.net_points = s.points_won - s.points_lost;
    delete s.head_to_head; // 不返回相互战绩详情
  });

  return standings;
}

/**
 * 计算淘汰赛排名
 * 排名规则：根据淘汰轮次确定名次
 */
async function calculateKnockoutStandings(eventId) {
  // 获取所有比赛，按轮次排序
  const [matches] = await pool.query(`
    SELECT m.*,
      u1.name as player1_name, u1.avatar_url as player1_avatar,
      u2.name as player2_name, u2.avatar_url as player2_avatar
    FROM matches m
    LEFT JOIN users u1 ON m.player1_id = u1.id
    LEFT JOIN users u2 ON m.player2_id = u2.id
    WHERE m.event_id = ?
    ORDER BY m.round DESC, m.match_order
  `, [eventId]);

  if (matches.length === 0) {
    return [];
  }

  // 找出最大轮次（决赛）
  const maxRound = Math.max(...matches.map(m => m.round || 1));

  const standings = [];
  const rankedPlayers = new Set();

  // 从决赛开始往前推
  for (let round = maxRound; round >= 1; round--) {
    const roundMatches = matches.filter(m => m.round === round);

    for (const match of roundMatches) {
      // 处理胜者
      if (match.winner_id && !rankedPlayers.has(match.winner_id)) {
        let rank;
        if (round === maxRound) {
          rank = 1; // 冠军
        } else if (round === maxRound - 1) {
          // 半决赛胜者进决赛，这里不处理
          continue;
        }

        const isPlayer1Winner = match.winner_id === match.player1_id;
        standings.push({
          rank,
          user_id: match.winner_id,
          name: isPlayer1Winner ? match.player1_name : match.player2_name,
          avatar_url: isPlayer1Winner ? match.player1_avatar : match.player2_avatar,
          eliminated_round: null,
          final_round: round
        });
        rankedPlayers.add(match.winner_id);
      }

      // 处理败者
      const loserId = match.winner_id === match.player1_id ? match.player2_id : match.player1_id;
      if (loserId && !rankedPlayers.has(loserId)) {
        let rank;
        if (round === maxRound) {
          rank = 2; // 亚军
        } else if (round === maxRound - 1) {
          rank = 3; // 4强（半决赛败者）
        } else if (round === maxRound - 2) {
          rank = 5; // 8强（1/4决赛败者）
        } else if (round === maxRound - 3) {
          rank = 9; // 16强
        } else {
          rank = Math.pow(2, maxRound - round) + 1;
        }

        const isPlayer1Loser = loserId === match.player1_id;
        standings.push({
          rank,
          user_id: loserId,
          name: isPlayer1Loser ? match.player1_name : match.player2_name,
          avatar_url: isPlayer1Loser ? match.player1_avatar : match.player2_avatar,
          eliminated_round: round,
          final_round: round
        });
        rankedPlayers.add(loserId);
      }
    }
  }

  // 按排名排序
  standings.sort((a, b) => a.rank - b.rank);

  // 添加轮次名称
  const roundNames = {
    [maxRound]: '决赛',
    [maxRound - 1]: '半决赛',
    [maxRound - 2]: '1/4决赛',
    [maxRound - 3]: '1/8决赛'
  };

  standings.forEach(s => {
    if (s.eliminated_round) {
      s.eliminated_at = roundNames[s.eliminated_round] || `第${s.eliminated_round}轮`;
    } else {
      s.eliminated_at = null;
    }
  });

  return standings;
}

/**
 * 计算小组赛+淘汰赛排名
 */
async function calculateGroupKnockoutStandings(eventId) {
  // 先获取淘汰赛阶段的排名
  const knockoutStandings = await calculateKnockoutStandings(eventId);

  // 获取未进入淘汰赛的选手（小组赛被淘汰）
  const [registrations] = await pool.query(`
    SELECT er.user_id, u.name, u.avatar_url
    FROM event_registrations er
    JOIN users u ON er.user_id = u.id
    WHERE er.event_id = ? AND er.status = 'confirmed'
  `, [eventId]);

  const rankedIds = new Set(knockoutStandings.map(s => s.user_id));
  const unrankedPlayers = registrations.filter(r => !rankedIds.has(r.user_id));

  // 小组赛被淘汰的选手排在淘汰赛选手之后
  const maxKnockoutRank = knockoutStandings.length > 0
    ? Math.max(...knockoutStandings.map(s => s.rank))
    : 0;

  unrankedPlayers.forEach((p, index) => {
    knockoutStandings.push({
      rank: maxKnockoutRank + index + 1,
      user_id: p.user_id,
      name: p.name,
      avatar_url: p.avatar_url,
      eliminated_at: '小组赛'
    });
  });

  return knockoutStandings;
}

// ==================== 团体赛项目分配相关接口 ====================

// 获取赛事的项目配置
router.get('/:id/team-project-config', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);

    const [events] = await pool.query(
      'SELECT team_event_config FROM events WHERE id = ?',
      [eventId]
    );

    if (events.length === 0) {
      return res.json({ success: false, message: '赛事不存在' });
    }

    const config = events[0].team_event_config || {
      projects: {
        men_singles: { enabled: false, count: 0 },
        women_singles: { enabled: false, count: 0 },
        men_doubles: { enabled: false, count: 0 },
        women_doubles: { enabled: false, count: 0 },
        mixed_doubles: { enabled: false, count: 0 }
      }
    };

    res.json({ success: true, data: config });
  } catch (error) {
    console.error('获取项目配置失败:', error);
    res.json({ success: false, message: '获取项目配置失败' });
  }
});

// 保存队伍的项目分配
router.put('/:id/team-project-assignments', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const eventId = parseInt(req.params.id, 10);
    const { user_id, team_name, assignments } = req.body;

    if (!user_id || !team_name || !Array.isArray(assignments)) {
      return res.json({ success: false, message: '参数错误' });
    }

    await conn.beginTransaction();

    // 验证用户是该队伍的领队
    const [captainCheck] = await conn.query(
      `SELECT ca.id, er.team_name
       FROM captain_applications ca
       JOIN event_registrations er
         ON er.event_id = ca.event_id
        AND er.user_id = ca.user_id
        AND er.is_team_leader = 1
        AND er.status != 'cancelled'
       WHERE ca.event_id = ?
         AND ca.user_id = ?
         AND ca.status = 'approved'
       ORDER BY er.id DESC
       LIMIT 1`,
      [eventId, user_id]
    );

    if (captainCheck.length === 0) {
      await conn.rollback();
      return res.json({ success: false, message: '只有领队可以分配项目' });
    }

    const actualTeamName = captainCheck[0].team_name || team_name;

    // 删除该队伍的旧分配
    await conn.query(
      'DELETE FROM team_project_assignments WHERE event_id = ? AND team_name = ?',
      [eventId, actualTeamName]
    );

    // 插入新分配
    for (const assignment of assignments) {
      const { project, position, player_a, player_b } = assignment;
      const hasAnyPlayer = !!player_a || !!player_b;

      if (!project || !position || !hasAnyPlayer) {
        continue;
      }

      await conn.query(
        `INSERT INTO team_project_assignments
         (event_id, team_name, project_type, position, player_a_id, player_b_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [eventId, actualTeamName, project, position, player_a, player_b || null]
      );
    }

    await conn.commit();
    res.json({ success: true, message: '项目分配已保存' });
  } catch (error) {
    await conn.rollback();
    console.error('保存项目分配失败:', error);
    res.json({ success: false, message: '保存项目分配失败' });
  } finally {
    conn.release();
  }
});

// 获取队伍的项目分配
router.get('/:id/team-project-assignments', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    const { user_id } = req.query;

    if (!user_id) {
      return res.json({ success: false, message: '缺少user_id参数' });
    }

    // 获取用户的队伍名称
    const captainApp = await getCaptainApplication(eventId, user_id);
    const teamContext = await getUserTeamContext(eventId, user_id);
    const leaderId = teamContext.leaderId || (captainApp?.status === 'approved' ? parseInt(user_id, 10) : null);
    const leaderReg = teamContext.leaderReg || (leaderId ? await getLeaderRegistration(eventId, leaderId) : null);
    if (!leaderId && captainApp?.status !== 'approved') {
      return res.json({ success: false, message: '未找到队伍信息' });
    }

    const [captain] = await pool.query(
      `SELECT team_name
       FROM event_registrations
       WHERE event_id = ?
         AND user_id = ?
         AND is_team_leader = 1
         AND status != 'cancelled'
       ORDER BY id DESC
       LIMIT 1`,
      [eventId, user_id]
    );

    if (captain.length === 0 && !leaderReg) {
      return res.json({ success: false, message: '未找到队伍信息' });
    }

    const teamName = leaderReg?.team_name || captain[0]?.team_name || '';
    if (!teamName) {
      return res.json({
        success: true,
        data: {
          assignments: [],
          member_projects: {}
        }
      });
    }

    // 获取项目分配
    const [assignments] = await pool.query(
      `SELECT project_type, position, player_a_id, player_b_id
       FROM team_project_assignments
       WHERE event_id = ? AND team_name = ?
       ORDER BY project_type, position`,
      [eventId, teamName]
    );
    const teamMembers = await getTeamMembers(eventId, leaderId);
    const sanitizedAssignments = sanitizeTeamProjectAssignments(assignments, teamMembers).assignments;

    // 构建每个队员参加的项目列表
    const memberProjects = buildMemberProjectsFromAssignments(sanitizedAssignments);


    res.json({
      success: true,
      data: {
          assignments: sanitizedAssignments,
        member_projects: memberProjects
      }
    });
  } catch (error) {
    console.error('获取项目分配失败:', error);
    res.json({ success: false, message: '获取项目分配失败' });
  }
});

module.exports = router;
module.exports.computeEventStatus = computeEventStatus;
