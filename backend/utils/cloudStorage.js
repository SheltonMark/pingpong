/**
 * CloudBase 云存储工具
 * 用于将文件上传到微信云开发的云存储中
 */

const cloudbase = require('@cloudbase/node-sdk');
const fs = require('fs');
const path = require('path');

// 初始化 CloudBase
let app = null;

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
  const tcbApp = initCloudBase();

  if (!tcbApp) {
    throw new Error('CloudBase not initialized. Check TCB_ENV_ID environment variable.');
  }

  try {
    // 先写入临时文件，再用 ReadStream 上传（SDK 对 Buffer 支持不稳定）
    const os = require('os');
    const tmpFile = path.join(os.tmpdir(), 'upload_' + Date.now() + '_' + Math.random().toString(36).slice(2));
    fs.writeFileSync(tmpFile, buffer);

    const result = await tcbApp.uploadFile({
      cloudPath: cloudPath,
      fileContent: fs.createReadStream(tmpFile)
    });

    // 清理临时文件
    try { fs.unlinkSync(tmpFile); } catch (e) {}

    // 直接从 fileID 构造 URL，避免 getTempFileURL 超时
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
