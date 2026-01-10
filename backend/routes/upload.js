const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 确保上传目录存在
const uploadDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置 multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // 生成唯一文件名
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

// 文件过滤器
const fileFilter = (req, file, cb) => {
  // 允许的文件类型
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

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  }
});

// 上传文件接口
router.post('/file', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '没有上传文件' });
    }

    // 构建完整的文件URL
    const relativePath = `/uploads/${req.file.filename}`;

    // 优先使用环境变量配置的BASE_URL，否则从请求中获取
    let baseUrl = process.env.BASE_URL;
    if (!baseUrl) {
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      if (host) {
        baseUrl = `${protocol}://${host}`;
      } else {
        // 默认值（腾讯云函数部署地址）
        baseUrl = 'https://express-lksv-207842-4-1391867763.sh.run.tcloudbase.com';
      }
    }

    // 返回完整URL（用于富文本编辑器等需要完整路径的场景）
    const fullUrl = baseUrl + relativePath;

    // 修复中文文件名乱码问题
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

    res.json({
      success: true,
      data: {
        url: fullUrl,           // 完整URL，用于富文本编辑器
        relativePath: relativePath, // 相对路径，备用
        filename: req.file.filename,
        originalName: originalName,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, message: '上传失败' });
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
