# 后端 Nginx 配置说明

## API 路径变更

去水印 API 路径从根路径改为 `/water` 子路径：
- 旧路径：`https://www.egoistcookie.top/api/parse`
- 新路径：`https://www.egoistcookie.top/water/api/parse`

## Nginx 配置示例

### 方案1：使用 location 前缀（推荐）

```nginx
server {
    listen 80;
    listen 443 ssl http2;
    server_name www.egoistcookie.top;

    # SSL 证书配置
    ssl_certificate /etc/letsencrypt/live/www.egoistcookie.top/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/www.egoistcookie.top/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # 个人网站根路径
    location / {
        root /var/www/html;
        index index.html index.htm;
        try_files $uri $uri/ =404;
    }

    # 去水印 API 路径（/water 子路径）
    location /water/ {
        proxy_pass http://127.0.0.1:5000/;  # 注意末尾的斜杠
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # HTTP 重定向到 HTTPS
    if ($scheme != "https") {
        return 301 https://$server_name$request_uri;
    }
}
```

### 方案2：使用 rewrite 重写

```nginx
server {
    listen 80;
    listen 443 ssl http2;
    server_name www.egoistcookie.top;

    # SSL 证书配置
    ssl_certificate /etc/letsencrypt/live/www.egoistcookie.top/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/www.egoistcookie.top/privkey.pem;

    # 个人网站根路径
    location / {
        root /var/www/html;
        index index.html index.htm;
        try_files $uri $uri/ =404;
    }

    # 去水印 API 路径（使用 rewrite）
    location /water {
        rewrite ^/water/(.*) /$1 break;
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 后端代码无需修改

后端 Flask 代码保持不变，路由仍然是：
- `/api/parse`
- `/api/image_proxy`
- `/api/doubao_cookie`
- `/health`

Nginx 会自动将 `/water/api/parse` 转发到后端的 `/api/parse`。

## 测试

### 测试 API 是否正常

```bash
# 测试健康检查
curl https://www.egoistcookie.top/water/health

# 测试解析接口
curl -X POST https://www.egoistcookie.top/water/api/parse \
  -H "Content-Type: application/json" \
  -d '{"short_link": "http://xhslink.com/o/3tnl8xYKwku"}'

# 测试图片代理
curl "https://www.egoistcookie.top/water/api/image_proxy?url=https%3A%2F%2Fsns-webpic-qc.xhscdn.com%2Fxxx.jpg"
```

## 小程序配置

### 域名白名单

在微信小程序后台配置：
- request合法域名：`https://www.egoistcookie.top`
- downloadFile合法域名：`https://www.egoistcookie.top`

注意：不需要单独配置 `/water` 路径，只需要配置域名即可。

### 前端代码

前端代码已修改为：
```javascript
apiBaseUrl: 'https://www.egoistcookie.top/water'
```

所有 API 请求会自动加上 `/water` 前缀：
- `https://www.egoistcookie.top/water/api/parse`
- `https://www.egoistcookie.top/water/api/image_proxy`

## 部署步骤

1. **更新 Nginx 配置**
   ```bash
   sudo nano /etc/nginx/sites-available/xhs-parser
   # 添加上述配置
   ```

2. **测试配置**
   ```bash
   sudo nginx -t
   ```

3. **重载 Nginx**
   ```bash
   sudo systemctl reload nginx
   ```

4. **测试 API**
   ```bash
   curl https://www.egoistcookie.top/water/health
   ```

5. **更新小程序代码**
   - 前端代码已更新
   - 重新编译并上传小程序

## 优点

1. **路径隔离**：个人网站和去水印 API 分离，互不影响
2. **易于管理**：可以单独配置 `/water` 路径的访问控制、限流等
3. **扩展性好**：未来可以添加更多子路径服务

## 注意事项

1. **后端服务端口**：确保后端服务运行在 5000 端口
2. **防火墙**：确保 80 和 443 端口开放
3. **SSL 证书**：确保 SSL 证书有效
4. **后端服务**：确保后端服务正常运行
