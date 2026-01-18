/**
 * 微信订阅消息工具
 * 用于发送微信小程序订阅消息通知
 */

const axios = require('axios');
const { pool } = require('../config/database');

const WX_APPID = process.env.WX_APPID;
const WX_SECRET = process.env.WX_SECRET;

// 消息模板配置
// 模板ID已配置
const MESSAGE_TEMPLATES = {
  // 邀请结果提醒 - 约球/组队邀请有人加入或回应
  // 字段：受邀请人、邀请时间、邀请地点、状态
  INVITATION_RESULT: {
    templateId: 'vo1aLJKvkrGWDs-5G-t-O3aXqJOOTwkh43e_5XIsM-o',
    // thing1: 受邀请人
    // time2: 邀请时间
    // thing3: 邀请地点
    // phrase4: 状态
  },

  // 审核结果通知 - 领队申请审核结果
  // 字段：审核结果、备注、审批时间、审批人
  APPROVAL_RESULT: {
    templateId: 'AO5koUcwh_9GkPlIWaN0GIxOA6vzrENUa04bVm8KV8c',
    // phrase1: 审核结果
    // thing2: 备注
    // time3: 审批时间
    // name4: 审批人
  },

  // 比赛开始通知 - 赛事即将开始
  // 字段：比赛名称、轮次、比赛状态、比赛时间
  MATCH_REMINDER: {
    templateId: 'GNfnS7sXWn6X6wUqKaCIef6pEneuMTzA1Q2WokikihU',
    // thing1: 比赛名称
    // thing2: 轮次
    // phrase3: 比赛状态
    // time4: 比赛时间
  },

  // 比分结果通知 - 对手提交了比分等待确认
  // 字段：观看人数、比分、排名
  SCORE_CONFIRM: {
    templateId: 'zf1s8Bn670p5PdR5N518h_jfdqo4BkrInarzLzOF6-8',
    // number1: 观看人数
    // character_string2: 比分
    // thing3: 排名
  }
};

// 缓存 access_token
let accessTokenCache = {
  token: null,
  expiresAt: 0
};

/**
 * 获取 access_token
 * @returns {Promise<string>}
 */
async function getAccessToken() {
  const now = Date.now();

  // 如果缓存有效，直接返回
  if (accessTokenCache.token && accessTokenCache.expiresAt > now) {
    return accessTokenCache.token;
  }

  if (!WX_APPID || !WX_SECRET) {
    throw new Error('微信 AppID 或 AppSecret 未配置');
  }

  try {
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WX_APPID}&secret=${WX_SECRET}`;
    const response = await axios.get(url);

    if (response.data.errcode) {
      throw new Error(`获取 access_token 失败: ${response.data.errmsg}`);
    }

    accessTokenCache = {
      token: response.data.access_token,
      expiresAt: now + (response.data.expires_in - 300) * 1000 // 提前5分钟过期
    };

    return accessTokenCache.token;
  } catch (error) {
    console.error('获取 access_token 失败:', error);
    throw error;
  }
}

/**
 * 发送订阅消息
 * @param {string} openid - 用户的 openid
 * @param {string} templateType - 模板类型 (INVITATION_RESULT, APPROVAL_RESULT, MATCH_REMINDER, SCORE_CONFIRM)
 * @param {object} data - 模板数据
 * @param {string} page - 点击消息跳转的页面路径
 * @returns {Promise<boolean>}
 */
async function sendSubscribeMessage(openid, templateType, data, page = 'pages/index/index') {
  try {
    const template = MESSAGE_TEMPLATES[templateType];

    if (!template || !template.templateId) {
      console.warn(`订阅消息模板 ${templateType} 未配置`);
      return false;
    }

    // 检查用户是否有订阅配额
    const hasQuota = await checkAndConsumeQuota(openid, templateType);
    if (!hasQuota) {
      console.log(`用户 ${openid} 没有 ${templateType} 的订阅配额`);
      return false;
    }

    const accessToken = await getAccessToken();
    const url = `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`;

    const response = await axios.post(url, {
      touser: openid,
      template_id: template.templateId,
      page: page,
      data: data,
      miniprogram_state: process.env.NODE_ENV === 'production' ? 'formal' : 'developer'
    });

    if (response.data.errcode === 0) {
      console.log(`订阅消息发送成功: ${templateType} -> ${openid}`);
      return true;
    } else {
      console.error(`订阅消息发送失败: ${response.data.errcode} - ${response.data.errmsg}`);
      // 如果是配额相关错误，恢复配额
      if (response.data.errcode === 43101) {
        await restoreQuota(openid, templateType);
      }
      return false;
    }
  } catch (error) {
    console.error('发送订阅消息失败:', error);
    return false;
  }
}

/**
 * 记录用户订阅
 * @param {number} userId - 用户ID
 * @param {string} templateType - 模板类型
 * @param {number} count - 订阅次数（默认为1）
 */
async function recordSubscription(userId, templateType, count = 1) {
  try {
    // 先检查是否已有记录
    const [existing] = await pool.query(
      'SELECT * FROM user_subscriptions WHERE user_id = ? AND template_type = ?',
      [userId, templateType]
    );

    if (existing.length > 0) {
      // 更新订阅次数
      await pool.execute(
        'UPDATE user_subscriptions SET remaining_count = remaining_count + ?, updated_at = NOW() WHERE user_id = ? AND template_type = ?',
        [count, userId, templateType]
      );
    } else {
      // 插入新记录
      await pool.execute(
        'INSERT INTO user_subscriptions (user_id, template_type, remaining_count) VALUES (?, ?, ?)',
        [userId, templateType, count]
      );
    }

    console.log(`用户 ${userId} 订阅 ${templateType} 成功，次数: ${count}`);
  } catch (error) {
    console.error('记录用户订阅失败:', error);
  }
}

/**
 * 检查并消费订阅配额
 * @param {string} openid - 用户的 openid
 * @param {string} templateType - 模板类型
 * @returns {Promise<boolean>}
 */
async function checkAndConsumeQuota(openid, templateType) {
  try {
    // 通过 openid 查找用户
    const [users] = await pool.query('SELECT id FROM users WHERE openid = ?', [openid]);
    if (users.length === 0) {
      return false;
    }

    const userId = users[0].id;

    // 检查订阅配额
    const [subs] = await pool.query(
      'SELECT * FROM user_subscriptions WHERE user_id = ? AND template_type = ? AND remaining_count > 0',
      [userId, templateType]
    );

    if (subs.length === 0) {
      return false;
    }

    // 消费一次配额
    await pool.execute(
      'UPDATE user_subscriptions SET remaining_count = remaining_count - 1, updated_at = NOW() WHERE user_id = ? AND template_type = ?',
      [userId, templateType]
    );

    return true;
  } catch (error) {
    console.error('检查订阅配额失败:', error);
    return false;
  }
}

/**
 * 恢复订阅配额（发送失败时调用）
 * @param {string} openid - 用户的 openid
 * @param {string} templateType - 模板类型
 */
async function restoreQuota(openid, templateType) {
  try {
    const [users] = await pool.query('SELECT id FROM users WHERE openid = ?', [openid]);
    if (users.length === 0) return;

    await pool.execute(
      'UPDATE user_subscriptions SET remaining_count = remaining_count + 1, updated_at = NOW() WHERE user_id = ? AND template_type = ?',
      [users[0].id, templateType]
    );
  } catch (error) {
    console.error('恢复订阅配额失败:', error);
  }
}

/**
 * 发送邀请结果通知
 * @param {string} openid - 接收者的 openid
 * @param {object} params - 参数
 * @param {string} params.inviteeName - 受邀请人姓名
 * @param {string} params.time - 邀请时间
 * @param {string} params.location - 邀请地点
 * @param {string} params.status - 状态（已加入/已拒绝等）
 * @param {string} params.page - 跳转页面
 */
async function sendInvitationResultNotice(openid, params) {
  const data = {
    thing1: { value: truncateString(params.inviteeName || params.participantName, 20) },
    time2: { value: params.time },
    thing3: { value: truncateString(params.location || '线上约球', 20) },
    phrase4: { value: params.status || params.result || '已加入' }
  };

  return sendSubscribeMessage(openid, 'INVITATION_RESULT', data, params.page || 'pages/invitations/invitations');
}

/**
 * 发送审核结果通知
 * @param {string} openid - 接收者的 openid
 * @param {object} params - 参数
 * @param {string} params.result - 审核结果（已通过/未通过）
 * @param {string} params.remark - 备注
 * @param {string} params.time - 审批时间
 * @param {string} params.approver - 审批人
 * @param {string} params.page - 跳转页面
 */
async function sendApprovalResultNotice(openid, params) {
  const data = {
    phrase1: { value: params.result },
    thing2: { value: truncateString(params.remark || '无', 20) },
    time3: { value: params.time },
    name4: { value: truncateString(params.approver || '管理员', 10) }
  };

  return sendSubscribeMessage(openid, 'APPROVAL_RESULT', data, params.page || 'pages/my-events/my-events');
}

/**
 * 发送比赛开始提醒
 * @param {string} openid - 接收者的 openid
 * @param {object} params - 参数
 * @param {string} params.eventName - 比赛名称
 * @param {string} params.round - 轮次
 * @param {string} params.status - 比赛状态
 * @param {string} params.matchTime - 比赛时间
 * @param {string} params.page - 跳转页面
 */
async function sendMatchReminderNotice(openid, params) {
  const data = {
    thing1: { value: truncateString(params.eventName, 20) },
    thing2: { value: truncateString(params.round || '小组赛', 20) },
    phrase3: { value: params.status || '即将开始' },
    time4: { value: params.matchTime }
  };

  return sendSubscribeMessage(openid, 'MATCH_REMINDER', data, params.page || 'pages/events/events');
}

/**
 * 发送比分结果通知
 * @param {string} openid - 接收者的 openid
 * @param {object} params - 参数
 * @param {number} params.viewCount - 观看人数（可选，默认0）
 * @param {string} params.score - 比分
 * @param {string} params.ranking - 排名信息
 * @param {string} params.page - 跳转页面
 */
async function sendScoreConfirmNotice(openid, params) {
  const data = {
    number1: { value: params.viewCount || 0 },
    character_string2: { value: params.score },
    thing3: { value: truncateString(params.ranking || params.matchInfo || '请确认比分', 20) }
  };

  return sendSubscribeMessage(openid, 'SCORE_CONFIRM', data, params.page || 'pages/score-confirm/score-confirm');
}

/**
 * 截断字符串
 * @param {string} str - 原字符串
 * @param {number} maxLength - 最大长度
 * @returns {string}
 */
function truncateString(str, maxLength) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 1) + '...';
}

/**
 * 格式化时间
 * @param {Date|string} date - 日期
 * @returns {string}
 */
function formatTime(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  return `${year}年${month}月${day}日 ${hour}:${minute}`;
}

/**
 * 更新消息模板ID
 * 在微信小程序后台申请模板后，调用此函数更新模板ID
 * @param {string} templateType - 模板类型
 * @param {string} templateId - 模板ID
 */
function updateTemplateId(templateType, templateId) {
  if (MESSAGE_TEMPLATES[templateType]) {
    MESSAGE_TEMPLATES[templateType].templateId = templateId;
    console.log(`模板 ${templateType} 已更新: ${templateId}`);
  }
}

/**
 * 获取当前配置的模板信息
 */
function getTemplateConfig() {
  return MESSAGE_TEMPLATES;
}

module.exports = {
  MESSAGE_TEMPLATES,
  getAccessToken,
  sendSubscribeMessage,
  recordSubscription,
  sendInvitationResultNotice,
  sendApprovalResultNotice,
  sendMatchReminderNotice,
  sendScoreConfirmNotice,
  updateTemplateId,
  getTemplateConfig,
  formatTime
};
