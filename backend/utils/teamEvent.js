const crypto = require('crypto');

const TEAM_GENDER_RULES = {
  UNLIMITED: 'unlimited',
  MALE_ONLY: 'male_only',
  FEMALE_ONLY: 'female_only',
  FIXED: 'fixed',
  MINIMUM: 'minimum'
};

const DEFAULT_TEAM_CONFIG = {
  minTeamPlayers: 2,
  maxTeamPlayers: 10,
  singlesPlayerCount: 3,
  genderRule: TEAM_GENDER_RULES.UNLIMITED,
  requiredMaleCount: 0,
  requiredFemaleCount: 0
};

function toInt(value, fallback = 0) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function normalizeTeamEventConfig(event = {}) {
  const minTeamPlayers = Math.max(2, toInt(event.min_team_players, DEFAULT_TEAM_CONFIG.minTeamPlayers));
  const maxTeamPlayers = Math.max(minTeamPlayers, toInt(event.max_team_players, DEFAULT_TEAM_CONFIG.maxTeamPlayers));
  const singlesPlayerCount = Math.max(1, toInt(event.singles_player_count, DEFAULT_TEAM_CONFIG.singlesPlayerCount));
  const genderRule = Object.values(TEAM_GENDER_RULES).includes(event.gender_rule)
    ? event.gender_rule
    : DEFAULT_TEAM_CONFIG.genderRule;

  return {
    minTeamPlayers,
    maxTeamPlayers,
    singlesPlayerCount,
    genderRule,
    requiredMaleCount: Math.max(0, toInt(event.required_male_count, DEFAULT_TEAM_CONFIG.requiredMaleCount)),
    requiredFemaleCount: Math.max(0, toInt(event.required_female_count, DEFAULT_TEAM_CONFIG.requiredFemaleCount))
  };
}

function validateTeamEventConfig(event = {}) {
  const config = normalizeTeamEventConfig(event);
  const errors = [];

  if (config.minTeamPlayers > config.maxTeamPlayers) {
    errors.push('每队最少人数不能大于每队最多人数');
  }
  if (config.maxTeamPlayers > 16) {
    errors.push('每队最多人数不能超过16人');
  }
  if (config.singlesPlayerCount > config.maxTeamPlayers) {
    errors.push('每队单打人数不能大于每队最多人数');
  }

  if (config.genderRule === TEAM_GENDER_RULES.FIXED) {
    const total = config.requiredMaleCount + config.requiredFemaleCount;
    if (total < config.minTeamPlayers || total > config.maxTeamPlayers) {
      errors.push('固定男女人数之和必须落在每队人数范围内');
    }
  }

  if (config.genderRule === TEAM_GENDER_RULES.MINIMUM) {
    const total = config.requiredMaleCount + config.requiredFemaleCount;
    if (total > config.maxTeamPlayers) {
      errors.push('至少男X女Y之和不能大于每队最多人数');
    }
  }

  return { valid: errors.length === 0, errors, config };
}

function summarizeParticipants(participants = []) {
  return participants.reduce((summary, participant) => {
    const gender = participant.gender || participant.member_gender;
    if (gender === 'male') {
      summary.maleCount += 1;
    } else if (gender === 'female') {
      summary.femaleCount += 1;
    }
    summary.totalCount += 1;
    return summary;
  }, {
    totalCount: 0,
    maleCount: 0,
    femaleCount: 0
  });
}

function validateTeamParticipants({ event, participants = [], singlesPlayerIds = [] }) {
  const config = normalizeTeamEventConfig(event);
  const errors = [];
  const uniqueSinglesIds = [...new Set(
    (singlesPlayerIds || [])
      .map((value) => toInt(value, NaN))
      .filter((value) => Number.isInteger(value))
  )];
  const participantIds = new Set(
    participants
      .map((participant) => toInt(participant.user_id || participant.id, NaN))
      .filter((value) => Number.isInteger(value))
  );
  const summary = summarizeParticipants(participants);

  if (summary.totalCount < config.minTeamPlayers) {
    errors.push(`每队至少需要${config.minTeamPlayers}名实际参赛队员`);
  }
  if (summary.totalCount > config.maxTeamPlayers) {
    errors.push(`每队最多只能有${config.maxTeamPlayers}名实际参赛队员`);
  }
  if (uniqueSinglesIds.length !== config.singlesPlayerCount) {
    errors.push(`请按赛事要求选择${config.singlesPlayerCount}名单打队员`);
  }

  for (const singlesId of uniqueSinglesIds) {
    if (!participantIds.has(singlesId)) {
      errors.push('单打队员必须来自实际参赛名单');
      break;
    }
  }

  switch (config.genderRule) {
    case TEAM_GENDER_RULES.MALE_ONLY:
      if (summary.femaleCount > 0) {
        errors.push('该赛事仅允许男子团体报名');
      }
      break;
    case TEAM_GENDER_RULES.FEMALE_ONLY:
      if (summary.maleCount > 0) {
        errors.push('该赛事仅允许女子团体报名');
      }
      break;
    case TEAM_GENDER_RULES.FIXED:
      if (
        summary.maleCount !== config.requiredMaleCount ||
        summary.femaleCount !== config.requiredFemaleCount
      ) {
        errors.push(`实际参赛名单必须为男${config.requiredMaleCount}人、女${config.requiredFemaleCount}人`);
      }
      break;
    case TEAM_GENDER_RULES.MINIMUM:
      if (summary.maleCount < config.requiredMaleCount || summary.femaleCount < config.requiredFemaleCount) {
        errors.push(`实际参赛名单至少需要男${config.requiredMaleCount}人、女${config.requiredFemaleCount}人`);
      }
      break;
    default:
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
    config,
    summary,
    singlesPlayerIds: uniqueSinglesIds
  };
}

function buildSubmittedTeamSummaries(registrations = []) {
  const teamMap = new Map();

  for (const row of registrations) {
    if (!row.team_name) {
      continue;
    }

    if (!teamMap.has(row.team_name)) {
      teamMap.set(row.team_name, {
        team_name: row.team_name,
        leader_id: null,
        leader_name: '',
        leader_phone: '',
        leader_avatar_url: '',
        leader_is_participating: false,
        actual_player_count: 0,
        male_count: 0,
        female_count: 0,
        submitted_at: row.team_submitted_at || row.confirmed_at || row.registered_at || null,
        members: [],
        singles_players: []
      });
    }

    const team = teamMap.get(row.team_name);
    const member = {
      user_id: row.user_id,
      name: row.name,
      phone: row.phone || '',
      gender: row.gender,
      avatar_url: row.avatar_url,
      is_team_leader: !!row.is_team_leader,
      is_participating: row.is_participating !== 0,
      is_singles_player: !!row.is_singles_player,
      school_name: row.school_name || '',
      college_name: row.college_name || ''
    };

    if (member.is_team_leader) {
      team.leader_id = row.user_id;
      team.leader_name = row.name;
      team.leader_phone = row.phone || '';
      team.leader_avatar_url = row.avatar_url || '';
      team.leader_is_participating = member.is_participating;
      if (row.team_submitted_at || row.confirmed_at || row.registered_at) {
        team.submitted_at = row.team_submitted_at || row.confirmed_at || row.registered_at;
      }
    }

    if (member.is_participating) {
      team.actual_player_count += 1;
      if (member.gender === 'male') {
        team.male_count += 1;
      } else if (member.gender === 'female') {
        team.female_count += 1;
      }
      team.members.push(member);
      if (member.is_singles_player) {
        team.singles_players.push(member);
      }
    }
  }

  return Array.from(teamMap.values()).map((team) => ({
    ...team,
    members: team.members.sort((left, right) => {
      if (left.is_team_leader === right.is_team_leader) {
        return left.user_id - right.user_id;
      }
      return left.is_team_leader ? -1 : 1;
    }),
    singles_player_names: team.singles_players.map((member) => member.name).join('、'),
    gender_summary: `男${team.male_count} / 女${team.female_count}`
  })).sort((left, right) => {
    const leftTime = left.submitted_at ? new Date(left.submitted_at).getTime() : 0;
    const rightTime = right.submitted_at ? new Date(right.submitted_at).getTime() : 0;
    return leftTime - rightTime;
  });
}

function buildTeamExportRows(teamSummaries = []) {
  const rows = [];

  teamSummaries.forEach((team, teamIndex) => {
    team.members.forEach((member, memberIndex) => {
      rows.push({
        team_index: teamIndex + 1,
        team_name: team.team_name,
        leader_name: team.leader_name,
        leader_is_participating: team.leader_is_participating ? '是' : '否',
        actual_player_count: team.actual_player_count,
        gender_summary: team.gender_summary,
        singles_player_count: team.singles_players.length,
        singles_player_names: team.singles_player_names,
        member_index: memberIndex + 1,
        member_name: member.name,
        member_gender: member.gender,
        member_role: member.is_team_leader ? '领队' : '队员',
        member_is_singles: member.is_singles_player ? '是' : '否',
        member_phone: member.phone || '',
        submitted_at: team.submitted_at
      });
    });
  });

  return rows;
}

function createInviteToken() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = {
  TEAM_GENDER_RULES,
  normalizeTeamEventConfig,
  validateTeamEventConfig,
  validateTeamParticipants,
  summarizeParticipants,
  buildSubmittedTeamSummaries,
  buildTeamExportRows,
  createInviteToken
};
