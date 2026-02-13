/**
 * CloudBase 云存储工具
 * 用于将文件上传到微信云开发的云存储中
 * 优先使用 COS SDK 直传（更稳定），回退到 @cloudbase/node-sdk
 */

const cloudbase = require('@cloudbase/node-sdk');
const COS = require('cos-nodejs-sdk-v5');
const fs = require('fs');
const path = require('path');

// 初始化 CloudBase
let app = null;

// COS 桶信息（从已知的 fileID 格式推导）
const COS_BUCKET = '7072-prod-1gc88z9k40350ea7-1391867763';
const COS_REGION = 'ap-shanghai';

function initCloudBase() {
  if (app) return app;

  const envId = process.env.TCB_ENV_ID || process.env.CBR_ENV_ID;

  if (!envId) {
    console.warn('CloudBase: No environment ID found, cloud storage disabled');
    return null;
  }

  try {
    // 在云托管环境中使用内置鉴权
    app = cloudbase.init({
      env: envId,
    });
    console.log('CloudBase initialized with env:', envId);
    return app;
  } catch (error) {
    console.error('CloudBase initialization failed:', error);
    return null;
  }
}

/**
 * 使用 COS SDK 直接上传（通过 metadata 服务获取临时密钥）
 */
async function uploadBufferViaCOS(buffer, cloudPath) {
  return new Promise((resolve, reject) => {
    const http = require('http');

    // 先从 metadata 服务获取临时密钥
    const getCredentials = () => {
      return new Promise((res, rej) => {
        // 先获取角色名
        const roleReq = http.get('http://metadata.tencentyun.com/latest/meta-data/cam/security-credentials/', { timeout: 3000 }, (roleRes) => {
          let roleData = '';
          roleRes.on('data', c => roleData += c);
          roleRes.on('end', () => {
            const roleName = roleData.trim();
            if (!roleName) return rej(new Error('No IAM role found in metadata'));
            // 用角色名获取临时密钥
            http.get(`http://metadata.tencentyun.com/latest/meta-data/cam/security-credentials/${roleName}`, { timeout: 3000 }, (credRes) => {
              let credData = '';
              credRes.on('data', c => credData += c);
              credRes.on('end', () => {
                try {
                  const cred = JSON.parse(credData);
                  res(cred);
                } catch (e) {
                  rej(new Error('Failed to parse metadata credentials: ' + credData));
                }
              });
            }).on('error', rej);
          });
        });
        roleReq.on('error', rej);
        roleReq.on('timeout', () => { roleReq.destroy(); rej(new Error('Metadata service timeout')); });
      });
    };

    getCredentials().then(cred => {
      const cos = new COS({
        SecretId: cred.TmpSecretId,
        SecretKey: cred.TmpSecretKey,
        SecurityToken: cred.Token,
      });

      cos.putObject({
        Bucket: COS_BUCKET,
        Region: COS_REGION,
        Key: cloudPath,
        Body: buffer,
      }, (err, data) => {
        if (err) {
          reject(err);
        } else {
          const downloadUrl = `https://${COS_BUCKET}.tcb.qcloud.la/${cloudPath}`;
          const fileID = `cloud://prod-1gc88z9k40350ea7.${COS_BUCKET}/${cloudPath}`;
          resolve({ fileID, downloadUrl });
        }
      });
    }).catch(reject);
  });
}

/**
 * 上传文件到云存储
 * @param {string} localFilePath - 本地文件路径
 * @param {string} cloudPath - 云存储路径 (如: 'uploads/events/xxx.jpg')
 * @returns {Promise<{fileID: string, downloadUrl: string}>}
 */
async function uploadFile(localFilePath, cloudPath) {
  const tcbApp = initCloudBase();

  if (!tcbApp) {
    throw new Error('CloudBase not initialized. Check TCB_ENV_ID environment variable.');
  }

  try {
    const result = await tcbApp.uploadFile({
      cloudPath: cloudPath,
      fileContent: fs.createReadStream(localFilePath)
    });

    // 直接从 fileID 构造 URL，避免 getTempFileURL 超时
    const downloadUrl = cloudIdToHttpUrl(result.fileID);

    return {
      fileID: result.fileID,
      downloadUrl: downloadUrl
    };
  } catch (error) {
    console.error('Upload to cloud storage failed:', error);
    throw error;
  }
}

/**
 * 从 cloud:// fileID 构造 HTTP 下载 URL（不依赖 getTempFileURL）
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
 * 上传文件缓冲区到云存储
 * @param {Buffer} buffer - 文件缓冲区
 * @param {string} cloudPath - 云存储路径
 * @returns {Promise<{fileID: string, downloadUrl: string}>}
 */
async function uploadBuffer(buffer, cloudPath) {
  // 优先尝试 COS SDK 直传
  try {
    console.log('Trying COS SDK upload:', cloudPath, 'size:', buffer.length);
    const result = await uploadBufferViaCOS(buffer, cloudPath);
    console.log('COS upload success:', result.fileID);
    return result;
  } catch (cosError) {
    console.error('COS SDK upload failed:', cosError.message, '- falling back to CloudBase SDK');
  }

  // 回退到 CloudBase SDK
  const tcbApp = initCloudBase();

  if (!tcbApp) {
    throw new Error('CloudBase not initialized. Check TCB_ENV_ID environment variable.');
  }

  try {
    const os = require('os');
    const tmpFile = path.join(os.tmpdir(), 'upload_' + Date.now() + '_' + Math.random().toString(36).slice(2));
    fs.writeFileSync(tmpFile, buffer);

    const result = await tcbApp.uploadFile({
      cloudPath: cloudPath,
      fileContent: fs.createReadStream(tmpFile)
    });

    try { fs.unlinkSync(tmpFile); } catch (e) {}

    const downloadUrl = cloudIdToHttpUrl(result.fileID);

    return {
      fileID: result.fileID,
      downloadUrl: downloadUrl
    };
  } catch (error) {
    console.error('Upload buffer to cloud storage failed:', error);
    throw error;
  }
}

/**
 * 获取文件的临时访问URL
 * @param {string|string[]} fileIDs - 文件ID或文件ID数组
 * @returns {Promise<Array<{fileID: string, tempFileURL: string}>>}
 */
async function getTempFileURL(fileIDs) {
  const tcbApp = initCloudBase();

  if (!tcbApp) {
    throw new Error('CloudBase not initialized');
  }

  const fileList = Array.isArray(fileIDs) ? fileIDs : [fileIDs];

  try {
    const result = await tcbApp.getTempFileURL({
      fileList: fileList
    });

    return result.fileList;
  } catch (error) {
    console.error('Get temp file URL failed:', error);
    throw error;
  }
}

/**
 * 删除云存储中的文件
 * @param {string|string[]} fileIDs - 文件ID或文件ID数组
 */
async function deleteFile(fileIDs) {
  const tcbApp = initCloudBase();

  if (!tcbApp) {
    throw new Error('CloudBase not initialized');
  }

  const fileList = Array.isArray(fileIDs) ? fileIDs : [fileIDs];

  try {
    await tcbApp.deleteFile({
      fileList: fileList
    });
    return true;
  } catch (error) {
    console.error('Delete file failed:', error);
    throw error;
  }
}

/**
 * 检查 CloudBase 是否可用
 */
function isCloudStorageAvailable() {
  const envId = process.env.TCB_ENV_ID || process.env.CBR_ENV_ID;
  return !!envId;
}

module.exports = {
  initCloudBase,
  uploadFile,
  uploadBuffer,
  getTempFileURL,
  deleteFile,
  isCloudStorageAvailable,
  cloudIdToHttpUrl
};
