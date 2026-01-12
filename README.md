# 水印去除工具 - 微信小程序

一款简洁实用的图片水印去除工具小程序。

## 功能特性

- ✅ 图片上传：支持从相册选择或拍照
- ✅ 短链解析：输入小红书短链，提取无水印原图直链
- ✅ 自动去水印：一键自动处理图片
- ✅ 手动涂抹：手指移动涂抹去除水印
- ✅ 画笔大小调节：可调整涂抹画笔大小
- ✅ 图片保存：保存处理后的图片到相册

## 使用方法

1. 点击"选择图片"按钮，从相册选择或拍照
2. 选择处理方式：
   - **自动去水印**：点击"自动去水印"按钮一键处理
   - **手动涂抹**：用手指在图片上移动涂抹需要去除的水印区域
3. 调整画笔大小（仅手动模式）
4. 点击"保存图片"将处理后的图片保存到相册

## 技术说明

- 使用微信小程序原生框架开发
- Canvas API 进行图片处理和绘制
- 手动涂抹使用 `destination-out` 合成模式实现擦除效果
- 自动去水印使用基础的图像处理算法

## 注意事项

- 小程序需要授权访问相册权限
- 自动去水印功能适合简单水印，复杂水印建议使用手动涂抹
- 图片处理在客户端完成，大图片可能处理较慢

## 项目结构

```
├── app.js              # 小程序入口
├── app.json            # 小程序配置
├── app.wxss            # 全局样式
├── pages/
│   └── index/          # 主页面
│       ├── index.js    # 页面逻辑
│       ├── index.wxml  # 页面结构
│       └── index.wxss  # 页面样式
├── backend/            # Python后端服务
│   ├── app.py          # Flask应用主文件
│   ├── requirements.txt # Python依赖
│   ├── README.md       # 后端说明文档
│   ├── config.md       # 配置说明
│   ├── start.bat       # Windows启动脚本
│   └── start.sh        # Linux/Mac启动脚本
└── README.md           # 说明文档
```

## 后端服务

本项目包含Python Flask后端服务，用于解析小红书短链。

### 快速开始

1. **安装后端依赖**
```bash
cd backend
pip install -r requirements.txt
```

2. **启动后端服务**
```bash
python app.py
```

服务将在 `http://localhost:5000` 启动

3. **配置小程序**
在 `pages/index/index.js` 中修改 `apiBaseUrl` 为你的后端地址：
```javascript
apiBaseUrl: 'http://localhost:5000'  // 本地开发
// 或
apiBaseUrl: 'https://your-server.com'  // 生产环境
```

详细配置说明请查看 [backend/config.md](backend/config.md)
