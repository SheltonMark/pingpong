# 浙工大乒协小程序项目

## 项目结构

```
pingpong/
├── backend/              # 后端服务（云托管）
│   ├── app.js           # Express 应用入口
│   ├── package.json     # 依赖配置
│   ├── Dockerfile       # Docker 构建文件
│   └── src/             # 源代码目录
│       ├── routes/      # 路由
│       ├── controllers/ # 控制器
│       ├── config/      # 配置
│       └── utils/       # 工具函数
├── pages/               # 小程序页面
│   └── index/           # 首页
├── app.js               # 小程序入口
├── app.json             # 小程序配置
└── app.wxss             # 全局样式
```

## 快速开始

### 1. 部署后端到云托管

1. 进入后端目录：
   ```
   cd backend
   ```

2. 在微信开发者工具中，打开云托管控制台

3. 上传代码到云托管服务（express-lksv）

4. 获取云托管服务地址

### 2. 配置小程序

1. 在 app.js 中，将 apiBase 替换为实际的云托管地址：
   ```javascript
   globalData: {
     apiBase: 'https://你的云托管地址.com'
   }
   ```

2. 在微信公众平台后台配置服务器域名白名单：
   - 登录 mp.weixin.qq.com > 开发 > 开发管理 > 服务器域名
   - 将云托管地址添加到 request 合法域名

### 3. 运行小程序

1. 在微信开发者工具中打开项目

2. 点击"编译"按钮

3. 在模拟器中查看效果

## API 接口

### GET /api/hello
获取 Hello World 消息

响应示例：
```json
{
  "success": true,
  "message": "Hello World",
  "data": {
    "text": "欢迎使用浙工大乒协小程序！",
    "timestamp": "2025-12-13T07:24:00.000Z"
  }
}
```

## 后续开发

1. 添加更多 API 接口
2. 连接 MySQL 数据库
3. 实现用户登录功能
4. 开发活动报名、签到等功能
