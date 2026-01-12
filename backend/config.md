# 后端服务配置说明

## 本地开发配置

1. **安装Python依赖**

**基础版本（推荐，无需编译）：**
```bash
cd backend
pip install -r requirements-basic.txt
```

或者直接安装：
```bash
pip install Flask flask-cors requests
```

**完整版本（包含Playwright，可选）：**
```bash
pip install -r requirements-full.txt
playwright install chromium
```

**注意**：如果遇到编译错误（需要Microsoft Visual C++），使用基础版本即可，Playwright是可选的。

2. **启动服务**
```bash
# Windows
python app.py
# 或
start.bat

# Linux/Mac
python app.py
# 或
chmod +x start.sh
./start.sh
```

3. **测试API**
```bash
curl -X POST http://localhost:5000/api/parse \
  -H "Content-Type: application/json" \
  -d '{"short_link": "http://xhslink.com/o/8UfOYeLNnDu"}'
```

## 小程序配置

在小程序代码中，需要修改 `pages/index/index.js` 中的 `apiBaseUrl`：

```javascript
data: {
  // 本地开发
  apiBaseUrl: 'http://localhost:5000'
  
  // 或部署到服务器后
  apiBaseUrl: 'https://your-server.com'
}
```

## 小程序域名配置

在微信公众平台配置服务器域名：

1. 登录 [微信公众平台](https://mp.weixin.qq.com/)
2. 进入 **开发** -> **开发管理** -> **开发设置** -> **服务器域名**
3. 在 **request合法域名** 中添加你的后端服务器域名（如：`https://your-server.com`）

## 部署到服务器

### 使用gunicorn（推荐）

```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

### 使用Docker（可选）

创建 `Dockerfile`:
```dockerfile
FROM python:3.9-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 5000
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:app"]
```

构建和运行：
```bash
docker build -t xhs-parser .
docker run -p 5000:5000 xhs-parser
```

## 注意事项

1. 小红书API可能需要登录态，某些笔记可能需要登录才能查看
2. 如果API调用失败，会自动降级到HTML解析
3. Playwright是可选的，主要用于处理JavaScript渲染的页面
4. 生产环境建议使用HTTPS和配置CORS白名单
