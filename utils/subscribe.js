/**
 * 微信订阅消息工具
 * 用于请求用户订阅消息授权并记录到后端
 */

const app = getApp();

// 消息模板类型
const TEMPLATE_TYPES = {
  INVITATION_RESULT: 'INVITATION_RESULT',     // 邀请结果通知
  APPROVAL_RESULT: 'APPROVAL_RESULT',         // 审核结果通知
  MATCH_REMINDER: 'MATCH_REMINDER',           // 比赛开始提醒
  SCORE_CONFIRM: 'SCORE_CONFIRM'              // 比分确认通知
};

// 模板ID配置
// 这些ID可以通过后端API动态获取更新
let templateIds = {
  INVITATION_RESULT: 'vo1aLJKvkrGWDs-5G-t-O3aXqJOOTwkh43e_5XIsM-o',
  APPROVAL_RESULT: 'AO5koUcwh_9GkPlIWaN0GIxOA6vzrENUa04bVm8KV8c',
  MATCH_REMINDER: 'GNfnS7sXWn6X6wUqKaCIef6pEneuMTzA1Q2WokikihU',
  SCORE_CONFIRM: 'zf1s8Bn670p5PdR5N518h_jfdqo4BkrInarzLzOF6-8'
};

/**
 * 从后端获取模板配置
 */
async function fetchTemplateConfig() {
  try {
    const res = await app.request('/api/subscription/templates');
    if (res && res.success && res.data) {
      const templates = res.data;
      for (const key in templates) {
        if (templates[key] && templates[key].templateId) {
          templateIds[key] = templates[key].templateId;
        }
      }
    }
    return templateIds;
  } catch (err) {
    console.error('获取模板配置失败:', err);
    return templateIds;
  }
}

/**
 * 请求订阅消息授权
 * @param {Array<string>} types - 模板类型数组，如 ['INVITATION_RESULT', 'SCORE_CONFIRM']
 * @returns {Promise<object>} - 返回订阅结果 { success: boolean, results: object }
 */
async function requestSubscription(types) {
  // 确保模板ID已加载
  if (!templateIds.INVITATION_RESULT) {
    await fetchTemplateConfig();
  }

  // 过滤出有效的模板ID
  const tmplIds = types
    .map(type => templateIds[type])
    .filter(id => id && id.length > 0);

  if (tmplIds.length === 0) {
    console.warn('没有可用的订阅消息模板ID');
    return { success: false, message: '没有可用的订阅消息模板' };
  }

  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: tmplIds,
      success: async (res) => {
        console.log('订阅结果:', res);

        // 统计订阅成功的模板
        const subscribedTypes = [];
        const subscribedCounts = [];

        for (const type of types) {
          const tmplId = templateIds[type];
          if (tmplId && res[tmplId] === 'accept') {
            subscribedTypes.push(type);
            subscribedCounts.push(1);
          }
        }

        // 如果有订阅成功的，记录到后端
        if (subscribedTypes.length > 0 && app.globalData.userInfo && app.globalData.userInfo.id) {
          try {
            await recordSubscription(subscribedTypes, subscribedCounts);
          } catch (error) {
            console.error('记录订阅失败:', error);
          }
        }

        resolve({
          success: true,
          results: res,
          subscribedTypes: subscribedTypes
        });
      },
      fail: (err) => {
        console.error('请求订阅失败:', err);
        resolve({
          success: false,
          error: err,
          message: err.errMsg || '请求订阅失败'
        });
      }
    });
  });
}

/**
 * 记录订阅到后端
 * @param {Array<string>} templateTypes - 模板类型数组
 * @param {Array<number>} counts - 每个模板的订阅次数
 */
async function recordSubscription(templateTypes, counts) {
  const userId = app.globalData.userInfo && app.globalData.userInfo.id;
  if (!userId) {
    throw new Error('用户未登录');
  }

  const res = await app.request('/api/subscription/record', {
    user_id: userId,
    template_types: templateTypes,
    counts: counts
  }, 'POST');

  if (res && res.success) {
    return res;
  } else {
    throw new Error(res ? res.message : '记录订阅失败');
  }
}

/**
 * 请求约球相关订阅（加入约球时通知创建者）
 */
async function requestInvitationSubscription() {
  return requestSubscription([TEMPLATE_TYPES.INVITATION_RESULT]);
}

/**
 * 请求领队申请相关订阅（审核结果通知）
 */
async function requestApprovalSubscription() {
  return requestSubscription([TEMPLATE_TYPES.APPROVAL_RESULT]);
}

/**
 * 请求比赛相关订阅（比赛提醒）
 */
async function requestMatchReminderSubscription() {
  return requestSubscription([TEMPLATE_TYPES.MATCH_REMINDER]);
}

/**
 * 请求比分确认订阅
 */
async function requestScoreConfirmSubscription() {
  return requestSubscription([TEMPLATE_TYPES.SCORE_CONFIRM]);
}

/**
 * 请求赛事相关全部订阅（报名赛事时使用）
 */
async function requestEventSubscriptions() {
  return requestSubscription([
    TEMPLATE_TYPES.MATCH_REMINDER,
    TEMPLATE_TYPES.SCORE_CONFIRM
  ]);
}

/**
 * 获取用户的订阅配额
 */
async function getSubscriptionQuota() {
  const userId = app.globalData.userInfo && app.globalData.userInfo.id;
  if (!userId) {
    throw new Error('用户未登录');
  }

  const res = await app.request('/api/subscription/quota', { user_id: userId });

  if (res && res.success) {
    return res.data;
  } else {
    throw new Error(res ? res.message : '获取配额失败');
  }
}

module.exports = {
  TEMPLATE_TYPES,
  fetchTemplateConfig,
  requestSubscription,
  recordSubscription,
  requestInvitationSubscription,
  requestApprovalSubscription,
  requestMatchReminderSubscription,
  requestScoreConfirmSubscription,
  requestEventSubscriptions,
  getSubscriptionQuota
};
