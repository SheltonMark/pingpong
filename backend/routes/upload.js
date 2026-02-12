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
      // 使用云存储（加大超时，本地存储在云托管环境不可靠）
      try {
        const category = req.body.category || 'uploads';
        const cloudPath = generateCloudPath(originalName, category);

        // 设置 30 秒超时
        const uploadPromise = cloudStorage.uploadBuffer(req.file.buffer, cloudPath);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Cloud upload timeout')), 30000)
        );
        const result = await Promise.race([uploadPromise, timeoutPromise]);
        fileUrl = result.downloadUrl;
        fileID = result.fileID;

        console.log('File uploaded to cloud storage:', fileID);
      } catch (cloudError) {
        console.error('Cloud storage upload failed:', cloudError.message);
        return res.status(500).json({ success: false, message: '图片上传失败，请重试' });
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

// 刷新云存储文件的临时URL
router.post('/refresh-url', async (req, res) => {
  try {
    const { fileID } = req.body;

    if (!fileID) {
      return res.status(400).json({ success: false, message: '缺少 fileID 参数' });
    }

    if (!useCloudStorage) {
      return res.status(400).json({ success: false, message: '云存储未启用' });
    }

    const result = await cloudStorage.getTempFileURL(fileID);
    const tempUrl = result[0]?.tempFileURL;

    if (!tempUrl) {
      return res.status(404).json({ success: false, message: '无法获取文件URL' });
    }

    res.json({
      success: true,
      data: {
        url: tempUrl,
        fileID: fileID
      }
    });
  } catch (error) {
    console.error('Refresh URL error:', error);
    res.status(500).json({ success: false, message: '获取URL失败' });
  }
});

// 删除云存储文件
router.delete('/file', async (req, res) => {
  try {
    const { fileID } = req.body;

    if (!fileID) {
      return res.status(400).json({ success: false, message: '缺少 fileID 参数' });
    }

    if (!useCloudStorage) {
      return res.status(400).json({ success: false, message: '云存储未启用' });
    }

    await cloudStorage.deleteFile(fileID);

    res.json({
      success: true,
      message: '文件已删除'
    });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ success: false, message: '删除失败' });
  }
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
