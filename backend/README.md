# 小红书短链解析后端服务

Python Flask后端服务，用于解析小红书短链并返回无水印原图URL。

## 功能特性

- ✅ 解析小红书短链（xhslink.com）
- ✅ 提取笔记ID并调用API获取图片
- ✅ 从HTML中提取图片URL
- ✅ 支持Playwright浏览器渲染（可选）
- ✅ RESTful API接口
- ✅ CORS跨域支持

## 安装依赖

### 基础版本（推荐，无需编译）

```bash
pip install -r requirements-basic.txt
```

或者直接安装：
```bash
pip install Flask flask-cors requests
```

### 完整版本（包含Playwright，需要C++编译器）

如果遇到编译错误（需要Microsoft Visual C++），可以使用基础版本。

如果需要Playwright功能（处理JavaScript渲染的页面）：
```bash
pip install -r requirements-full.txt
playwright install chromium
```

**注意**：Playwright是可选的，代码会自动处理Playwright未安装的情况。

## 运行服务

```bash
python app.py
```

服务将在 `http://localhost:5000` 启动

## API接口

### 解析短链

**POST** `/api/parse`

**请求体：**
```json
{
  "short_link": "http://xhslink.com/o/8UfOYeLNnDu"
}
```

**响应：**
```json
{
  "success": true,
  "data": {
    "image_url": "https://sns-img-qc.xhscdn.com/...",
    "all_images": ["https://..."],
    "note_id": "xxx",
    "target_url": "https://www.xiaohongshu.com/explore/xxx"
  }
}
```

### 健康检查

**GET** `/health`

## 注意事项

1. 小红书API可能需要登录态，如果API调用失败会自动降级到HTML解析
2. 某些笔记可能需要登录才能查看，解析可能失败
3. 建议部署到服务器时使用生产级WSGI服务器（如gunicorn）

## 部署示例（使用gunicorn）

```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```
