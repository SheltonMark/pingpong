const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Blob } = require('buffer');

const { pool } = require('../config/database');
const cloudStorage = require('./cloudStorage');

const DEFAULT_BASE_URL = 'https://express-lksv-207842-4-1391867763.sh.run.tcloudbase.com';
const CONTENT_SECURITY_REJECT_MESSAGE = '发布内容未通过审核，请修改后再试';
const CONTENT_SECURITY_IMAGE_REJECT_MESSAGE = '图片未通过审核，请更换后再试';
const CONTENT_SECURITY_SERVICE_MESSAGE = '内容安全校验失败，请稍后重试';
const CONTENT_SECURITY_REJECT_CODES = new Set([87014, 20001]);
const CONTENT_SECURITY_REJECT_SUGGESTS = new Set(['review', 'risky', 'reject', 'block']);

class ContentSecurityError extends Error {
  constructor(message, code, statusCode, details = {}) {
    super(message);
    this.name = 'ContentSecurityError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

class ContentSecurityRejectedError extends ContentSecurityError {
  constructor(message = CONTENT_SECURITY_REJECT_MESSAGE, details = {}) {
    super(message, 'CONTENT_SECURITY_REJECTED', 400, details);
    this.name = 'ContentSecurityRejectedError';
  }
}

class ContentSecurityServiceError extends ContentSecurityError {
  constructor(message = CONTENT_SECURITY_SERVICE_MESSAGE, details = {}) {
    super(message, 'CONTENT_SECURITY_UNAVAILABLE', 503, details);
    this.name = 'ContentSecurityServiceError';
  }
}

function normalizeTextEntries(entries = []) {
  return entries
    .map((entry) => {
      if (!entry) {
        return null;
      }
      if (typeof entry === 'string') {
        const value = entry.trim();
        return value ? { label: '内容', value } : null;
      }

      const value = typeof entry.value === 'string'
        ? entry.value.trim()
        : (entry.value == null ? '' : String(entry.value).trim());

      if (!value) {
        return null;
      }

      return {
        label: entry.label || '内容',
        value
      };
    })
    .filter(Boolean);
}

function normalizeImageEntries(entries = []) {
  return entries
    .map((entry) => {
      if (!entry) {
        return null;
      }
      if (typeof entry === 'string') {
        const value = entry.trim();
        return value ? { label: '图片', value } : null;
      }

      const value = typeof entry.value === 'string'
        ? entry.value.trim()
        : '';

      if (!value) {
        return null;
      }

      return {
        label: entry.label || '图片',
        value
      };
    })
    .filter(Boolean);
}

function resolveBaseUrl(baseUrl) {
  return (baseUrl || process.env.BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function guessContentType(filename = '') {
  const extension = path.extname(filename).toLowerCase();
  switch (extension) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

function getUploadsFilePath(urlPath) {
  const cleanPath = (urlPath || '').split('?')[0].split('#')[0];
  const relativePath = cleanPath.replace(/^\/+/, '');

  if (!relativePath.startsWith('uploads/')) {
    return null;
  }

  const segments = relativePath.split('/').filter(Boolean);
  return path.join(path.resolve(__dirname, '..'), 'public', ...segments);
}

function resolveImageSource(source, options = {}) {
  if (!source) {
    return null;
  }

  const value = String(source).trim();
  if (!value) {
    return null;
  }

  const cloudIdToHttpUrl = options.cloudIdToHttpUrl || cloudStorage.cloudIdToHttpUrl;
  const baseUrl = resolveBaseUrl(options.baseUrl);

  if (value.startsWith('cloud://')) {
    return {
      original: value,
      sourceType: 'cloud',
      url: cloudIdToHttpUrl(value),
      filePath: null
    };
  }

  if (value.startsWith('/uploads/') || value.startsWith('uploads/')) {
    const normalizedPath = value.startsWith('/') ? value : `/${value}`;
    return {
      original: value,
      sourceType: 'upload',
      url: `${baseUrl}${normalizedPath}`,
      filePath: getUploadsFilePath(normalizedPath)
    };
  }

  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      const filePath = getUploadsFilePath(parsed.pathname);
      return {
        original: value,
        sourceType: filePath ? 'upload_url' : 'url',
        url: value,
        filePath
      };
    } catch (error) {
      throw new ContentSecurityServiceError(CONTENT_SECURITY_SERVICE_MESSAGE, {
        reason: 'invalid_image_url',
        source: value
      });
    }
  }

  if (path.isAbsolute(value)) {
    return {
      original: value,
      sourceType: 'file',
      url: null,
      filePath: value
    };
  }

  return {
    original: value,
    sourceType: 'relative',
    url: `${baseUrl}/${value.replace(/^\/+/, '')}`,
    filePath: null
  };
}

async function resolveOpenId({ openid, userId, queryExecutor = pool }) {
  if (openid) {
    return openid;
  }
  if (!userId) {
    return null;
  }

  const [rows] = await queryExecutor.query(
    'SELECT openid FROM users WHERE id = ? LIMIT 1',
    [userId]
  );

  return rows[0] && rows[0].openid ? rows[0].openid : null;
}

function buildTextCheckPayload(content, { openid, scene = 3 } = {}) {
  const payload = {
    content,
    version: 2,
    scene
  };

  if (openid) {
    payload.openid = openid;
  }

  return payload;
}

function interpretCheckResult(result) {
  if (!result || typeof result !== 'object') {
    return { action: 'error', reason: 'empty result' };
  }

  const suggest = result.result && typeof result.result.suggest === 'string'
    ? result.result.suggest
    : (typeof result.suggest === 'string' ? result.suggest : '');

  if (suggest) {
    if (suggest === 'pass') {
      return { action: 'pass' };
    }

    if (CONTENT_SECURITY_REJECT_SUGGESTS.has(suggest)) {
      return {
        action: 'reject',
        reason: result.errmsg || suggest
      };
    }
  }

  const errcode = Number(result.errcode || 0);
  if (errcode === 0) {
    return { action: 'pass' };
  }

  if (CONTENT_SECURITY_REJECT_CODES.has(errcode)) {
    return {
      action: 'reject',
      reason: result.errmsg || 'risky content'
    };
  }

  return {
    action: 'error',
    reason: result.errmsg || `errcode ${errcode}`
  };
}

async function defaultTextChecker(payload) {
  const accessToken = await cloudStorage.getAccessToken();
  const url = `https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${accessToken}`;
  const response = await axios.post(url, payload, { timeout: 10000 });
  return response.data;
}

async function defaultImageChecker(asset) {
  const accessToken = await cloudStorage.getAccessToken();
  const url = `https://api.weixin.qq.com/wxa/img_sec_check?access_token=${accessToken}`;
  const form = new FormData();
  const blob = new Blob([asset.buffer], {
    type: asset.contentType || 'application/octet-stream'
  });

  form.append('media', blob, asset.filename || 'image');

  const response = await fetch(url, {
    method: 'POST',
    body: form
  });

  if (!response.ok) {
    throw new Error(`wechat image check failed with status ${response.status}`);
  }

  return response.json();
}

async function readImageAsset(sourceInfo) {
  if (sourceInfo.filePath && fs.existsSync(sourceInfo.filePath)) {
    const buffer = await fs.promises.readFile(sourceInfo.filePath);
    return {
      buffer,
      filename: path.basename(sourceInfo.filePath) || 'image',
      contentType: guessContentType(sourceInfo.filePath)
    };
  }

  if (!sourceInfo.url) {
    throw new Error('image source is not readable');
  }

  const response = await fetch(sourceInfo.url);
  if (!response.ok) {
    throw new Error(`download image failed with status ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const parsedUrl = new URL(sourceInfo.url);
  return {
    buffer: Buffer.from(arrayBuffer),
    filename: path.basename(parsedUrl.pathname) || 'image',
    contentType: response.headers.get('content-type') || guessContentType(parsedUrl.pathname)
  };
}

function ensureResultPassed(result, { label, rejectMessage }) {
  const interpreted = interpretCheckResult(result);

  if (interpreted.action === 'pass') {
    return;
  }

  if (interpreted.action === 'reject') {
    throw new ContentSecurityRejectedError(rejectMessage, {
      label,
      reason: interpreted.reason
    });
  }

  throw new ContentSecurityServiceError(CONTENT_SECURITY_SERVICE_MESSAGE, {
    label,
    reason: interpreted.reason
  });
}

async function assertSafeTexts(entries, options = {}) {
  const texts = normalizeTextEntries(entries);
  if (texts.length === 0) {
    return;
  }

  const openid = await resolveOpenId(options);
  if (!openid) {
    throw new ContentSecurityServiceError(CONTENT_SECURITY_SERVICE_MESSAGE, {
      reason: 'missing_openid_for_text_check'
    });
  }

  const textChecker = options.textChecker || defaultTextChecker;
  const scene = options.scene || 3;

  for (const entry of texts) {
    const result = await textChecker(buildTextCheckPayload(entry.value, { openid, scene }), entry);
    ensureResultPassed(result, {
      label: entry.label,
      rejectMessage: options.rejectMessage || CONTENT_SECURITY_REJECT_MESSAGE
    });
  }
}

async function assertSafeImages(entries, options = {}) {
  const images = normalizeImageEntries(entries);
  if (images.length === 0) {
    return;
  }

  const imageChecker = options.imageChecker || defaultImageChecker;
  const imageReader = options.imageReader || readImageAsset;

  for (const entry of images) {
    const sourceInfo = resolveImageSource(entry.value, options);
    if (!sourceInfo) {
      continue;
    }

    const asset = await imageReader(sourceInfo, entry);
    const result = await imageChecker(asset, {
      label: entry.label,
      sourceInfo
    });

    ensureResultPassed(result, {
      label: entry.label,
      rejectMessage: options.rejectMessage || CONTENT_SECURITY_IMAGE_REJECT_MESSAGE
    });
  }
}

async function assertSafeImageBuffer(buffer, options = {}) {
  if (!buffer || buffer.length === 0) {
    return;
  }

  const imageChecker = options.imageChecker || defaultImageChecker;
  const result = await imageChecker({
    buffer,
    filename: options.filename || 'image',
    contentType: options.contentType || 'application/octet-stream'
  });

  ensureResultPassed(result, {
    label: options.label || '图片',
    rejectMessage: options.rejectMessage || CONTENT_SECURITY_IMAGE_REJECT_MESSAGE
  });
}

async function assertSafeSubmission(options = {}) {
  const sharedOptions = {
    openid: options.openid,
    userId: options.userId,
    queryExecutor: options.queryExecutor,
    baseUrl: options.baseUrl
  };

  await assertSafeTexts(options.texts || [], {
    ...sharedOptions,
    scene: options.textScene || options.scene || 3,
    rejectMessage: options.textRejectMessage,
    textChecker: options.textChecker
  });

  await assertSafeImages(options.images || [], {
    ...sharedOptions,
    rejectMessage: options.imageRejectMessage,
    cloudIdToHttpUrl: options.cloudIdToHttpUrl,
    imageChecker: options.imageChecker,
    imageReader: options.imageReader
  });
}

function isContentSecurityError(error) {
  return error instanceof ContentSecurityError;
}

function handleContentSecurityError(res, error) {
  if (!isContentSecurityError(error)) {
    return false;
  }

  res.status(error.statusCode || 400).json({
    success: false,
    message: error.message
  });
  return true;
}

module.exports = {
  CONTENT_SECURITY_REJECT_MESSAGE,
  CONTENT_SECURITY_IMAGE_REJECT_MESSAGE,
  CONTENT_SECURITY_SERVICE_MESSAGE,
  ContentSecurityError,
  ContentSecurityRejectedError,
  ContentSecurityServiceError,
  assertSafeTexts,
  assertSafeImages,
  assertSafeImageBuffer,
  assertSafeSubmission,
  resolveImageSource,
  buildTextCheckPayload,
  interpretCheckResult,
  handleContentSecurityError,
  isContentSecurityError
};
