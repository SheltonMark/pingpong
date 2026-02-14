/**
 * 云存储工具 - 通过微信 API 上传文件到云开发对象存储
 *
 * 流程：
 * 1. 用 WX_APPID + WX_SECRET 获取 access_token
 * 2. 调用 /tcb/uploadfile 获取上传链接和凭证
 * 3. POST multipart/form-data 到返回的 url 完成上传
 */

const fs = require('fs');
const https = require('https');

const WX_APPID = process.env.WX_APPID;
const WX_SECRET = process.env.WX_SECRET;
const ENV_ID = process.env.CBR_ENV_ID || process.env.TCB_ENV_ID;

// 是否在云托管环境内（有CBR_ENV_ID说明在云托管内部）
const isInCloudRun = !!process.env.CBR_ENV_ID;

// access_token 缓存
let tokenCache = { token: null, expireTime: 0 };

/**
 * 获取微信 access_token（带缓存）
 * 云托管内部优先走内网，失败回退外网
 */
async function getAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expireTime) {
    return tokenCache.token;
  }

  function saveToken(result) {
    tokenCache = {
      token: result.access_token,
      expireTime: Date.now() + (result.expires_in - 300) * 1000
    };
    return result.access_token;
  }

  // 云托管内部先尝试内网调用
  if (isInCloudRun) {
    try {
      const http = require('http');
      const token = await new Promise((resolve, reject) => {
        const postData = JSON.stringify({ grant_type: 'client_credential' });
        const req = http.request({
          hostname: 'api.weixin.qq.com',
          path: '/cgi-bin/token',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
          timeout: 5000
        }, (res) => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              if (result.access_token) resolve(saveToken(result));
              else reject(new Error(data));
            } catch (e) { reject(e); }
          });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.write(postData);
        req.end();
      });
      return token;
    } catch (e) {
      console.log('[WxCloud] 内网获取token失败，回退外网:', e.message);
    }
  }

  // 外网调用：需要 appid 和 secret
  if (!WX_APPID || !WX_SECRET) {
    throw new Error('缺少 WX_APPID 或 WX_SECRET');
  }
  return new Promise((resolve, reject) => {
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WX_APPID}&secret=${WX_SECRET}`;
    https.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.access_token) resolve(saveToken(result));
          else reject(new Error('获取access_token失败: ' + data));
        } catch (e) { reject(new Error('解析access_token失败: ' + data)); }
      });
    }).on('error', reject);
  });
}

/**
 * 调用微信 API 获取文件上传链接
 */
async function getUploadLink(accessToken, cloudPath) {
  const httpModule = isInCloudRun ? require('http') : https;
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ env: ENV_ID, path: cloudPath });
    const req = httpModule.request({
      hostname: 'api.weixin.qq.com',
      path: `/tcb/uploadfile?access_token=${accessToken}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.errcode === 0 || result.url) {
            resolve(result);
          } else {
            reject(new Error('获取上传链接失败: ' + data));
          }
        } catch (e) {
          reject(new Error('解析上传链接失败: ' + data));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * POST 文件到 COS（multipart/form-data）
 */
async function postFileToCOS(uploadUrl, cloudPath, authorization, token, cosFileId, buffer) {
  return new Promise((resolve, reject) => {
    const boundary = '----WxCloudUpload' + Date.now().toString(36);

    // 构建 multipart body 各字段
    const fields = [
      { name: 'key', value: cloudPath },
      { name: 'Signature', value: authorization },
      { name: 'x-cos-security-token', value: token },
      { name: 'x-cos-meta-fileid', value: cosFileId },
    ];

    const parts = [];
    for (const f of fields) {
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${f.name}"\r\n\r\n${f.value}\r\n`
      ));
    }
    // file 字段必须放最后
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="file"\r\nContent-Type: application/octet-stream\r\n\r\n`
    ));
    parts.push(buffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const body = Buffer.concat(parts);
    const urlObj = new URL(uploadUrl);

    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
      timeout: 60000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        // 204 = 成功
        if (res.statusCode === 200 || res.statusCode === 204) {
          resolve();
        } else {
          reject(new Error(`COS上传失败: ${res.statusCode} ${data.substring(0, 300)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('COS上传超时')); });
    req.write(body);
    req.end();
  });
}

/**
 * 从 file_id 构造 HTTP 下载 URL
 * cloud://prod-1gc88z9k40350ea7.7072-prod-1gc88z9k40350ea7-1391867763/path
 * → https://7072-prod-1gc88z9k40350ea7-1391867763.tcb.qcloud.la/path
 */
function cloudIdToHttpUrl(fileID) {
  if (!fileID || !fileID.startsWith('cloud://')) return fileID;
  try {
    const withoutPrefix = fileID.replace('cloud://', '');
    const dotIndex = withoutPrefix.indexOf('.');
    const slashIndex = withoutPrefix.indexOf('/');
    if (dotIndex === -1 || slashIndex === -1) return fileID;
    const bucket = withoutPrefix.substring(dotIndex + 1, slashIndex);
    const filePath = withoutPrefix.substring(slashIndex + 1);
    return `https://${bucket}.tcb.qcloud.la/${filePath}`;
  } catch (e) {
    return fileID;
  }
}

/**
 * 上传 Buffer 到云存储
 */
async function uploadBuffer(buffer, cloudPath) {
  if (!ENV_ID) {
    throw new Error('缺少 ENV_ID 环境变量');
  }

  console.log('[WxCloud] 开始上传, path:', cloudPath, 'size:', buffer.length);

  // 1. 获取 access_token
  const accessToken = await getAccessToken();

  // 2. 获取上传链接
  const info = await getUploadLink(accessToken, cloudPath);
  console.log('[WxCloud] 获取上传链接成功, file_id:', info.file_id);

  // 3. POST 文件到 COS
  await postFileToCOS(info.url, cloudPath, info.authorization, info.token, info.cos_file_id, buffer);

  const downloadUrl = cloudIdToHttpUrl(info.file_id);
  console.log('[WxCloud] 上传成功, url:', downloadUrl);

  return {
    fileID: info.file_id,
    downloadUrl: downloadUrl
  };
}

/**
 * 上传本地文件到云存储
 */
async function uploadFile(localFilePath, cloudPath) {
  const buffer = fs.readFileSync(localFilePath);
  return uploadBuffer(buffer, cloudPath);
}

/**
 * 检查云存储是否可用
 */
function isCloudStorageAvailable() {
  // 云托管内部：只需要 ENV_ID
  if (isInCloudRun && ENV_ID) return true;
  // 外部：需要完整凭证
  return !!(WX_APPID && WX_SECRET && ENV_ID);
}

module.exports = {
  uploadFile,
  uploadBuffer,
  isCloudStorageAvailable,
  cloudIdToHttpUrl,
  getAccessToken,
  getUploadLink
};
