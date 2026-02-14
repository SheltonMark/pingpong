const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudStorage = require('../utils/cloudStorage');

// 确保上传目录存在（用于临时文件或本地存储回退）
const uploadDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置 multer - 使用内存存储用于云存储上传
const memoryStorage = multer.memoryStorage();

// 配置 multer - 使用磁盘存储用于本地存储回退
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

// 文件过滤器
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv',
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg', 'image/png', 'image/gif'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('不支持的文件类型'), false);
  }
};

// 根据是否有云存储环境选择存储方式
const useCloudStorage = cloudStorage.isCloudStorageAvailable();

const upload = multer({
  storage: useCloudStorage ? memoryStorage : diskStorage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  }
});

// 生成云存储路径
function generateCloudPath(originalName, category = 'uploads') {
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
  const ext = path.extname(originalName);
  return `${category}/${uniqueSuffix}${ext}`;
}

// 上传文件接口
router.post('/file', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '没有上传文件' });
    }

    // 修复中文文件名乱码问题
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

    let fileUrl;
    let fileID = null;

    if (useCloudStorage && req.file.buffer) {
      // 使用云存储
      try {
        const category = req.body.category || 'uploads';
        const cloudPath = generateCloudPath(originalName, category);

        console.log('Uploading to cloud:', cloudPath, 'size:', req.file.buffer.length);

        const result = await cloudStorage.uploadBuffer(req.file.buffer, cloudPath);
        fileUrl = result.downloadUrl;
        fileID = result.fileID;

        console.log('File uploaded to cloud storage:', fileID, 'url:', fileUrl);
      } catch (cloudError) {
        console.error('Cloud storage upload failed:', cloudError.message, cloudError.stack, JSON.stringify(cloudError));

        // 如果要求必须云存储，直接报错
        if (req.query.require_cloud === '1') {
          return res.status(500).json({ success: false, message: '云存储上传失败，请重试: ' + cloudError.message });
        }

        // 回退到本地存储（云托管环境下文件可能在重启后丢失，但至少当前可用）
        const localFilename = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(originalName);
        const localPath = path.join(uploadDir, localFilename);
        fs.writeFileSync(localPath, req.file.buffer);

        const relativePath = `/uploads/${localFilename}`;
        fileUrl = getBaseUrl(req) + relativePath;
        console.log('Saved locally:', fileUrl);
      }
    } else {
      // 使用本地存储
      const relativePath = `/uploads/${req.file.filename}`;
      fileUrl = getBaseUrl(req) + relativePath;
    }

    res.json({
      success: true,
      data: {
        url: fileUrl,
        fileID: fileID, // 云存储文件ID，可用于删除等操作
        filename: req.file.filename || path.basename(fileUrl),
        originalName: originalName,
        size: req.file.size,
        mimetype: req.file.mimetype,
        storageType: useCloudStorage ? 'cloud' : 'local'
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, message: '上传失败: ' + error.message });
  }
});

// 获取基础URL
function getBaseUrl(req) {
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
  return baseUrl;
}

// 刷新云存储文件的URL
router.post('/refresh-url', async (req, res) => {
  try {
    const { fileID } = req.body;

    if (!fileID) {
      return res.status(400).json({ success: false, message: '缺少 fileID 参数' });
    }

    // 直接用 cloudIdToHttpUrl 转换
    const url = cloudStorage.cloudIdToHttpUrl(fileID);

    res.json({
      success: true,
      data: { url, fileID }
    });
  } catch (error) {
    console.error('Refresh URL error:', error);
    res.status(500).json({ success: false, message: '获取URL失败' });
  }
});

// 删除云存储文件（暂不支持）
router.delete('/file', async (req, res) => {
  res.status(501).json({ success: false, message: '暂不支持删除云存储文件' });
});

// 临时调试：测试云存储上传流程
router.get('/debug-cloud', async (req, res) => {
  const result = {
    CBR_ENV_ID: process.env.CBR_ENV_ID || 'unset',
    WX_APPID: process.env.WX_APPID ? 'set' : 'unset',
    WX_SECRET: process.env.WX_SECRET ? 'set' : 'unset',
    useCloudStorage: useCloudStorage,
  };

  // 测试获取 access_token
  try {
    const token = await cloudStorage.getAccessToken();
    result.accessToken = token ? 'ok (length: ' + token.length + ')' : 'empty';
  } catch (e) {
    result.accessToken = 'error: ' + e.message;
  }

  // 测试获取上传链接
  if (result.accessToken && result.accessToken.startsWith('ok')) {
    try {
      const token = await cloudStorage.getAccessToken();
      const info = await cloudStorage.getUploadLink(token, 'test/debug-' + Date.now() + '.txt');
      result.uploadLink = info.url ? 'ok' : 'no url';
      result.fileId = info.file_id || 'none';
    } catch (e) {
      result.uploadLink = 'error: ' + e.message;
    }
  }

  res.json(result);
});

// 错误处理
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: '文件大小超过限制（最大100MB）' });
    }
    return res.status(400).json({ success: false, message: error.message });
  }
  if (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
  next();
});

module.exports = router;
