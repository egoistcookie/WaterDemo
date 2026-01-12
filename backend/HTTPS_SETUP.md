# HTTPS配置指南

微信小程序要求使用HTTPS协议，不能使用HTTP。以下是配置HTTPS的详细步骤。

## 方案1：使用域名 + Let's Encrypt免费SSL证书（推荐）

### 前提条件
- 有一个域名（如：`www.egoistcookie.top`）
- 域名已解析到服务器IP `120.77.92.36`
- 域名已完成实名认证（如果服务器在国内）

### 步骤1：安装Nginx和Certbot

**如果是 Debian/Ubuntu 系统：**

```bash
# 安装Nginx
apt update
apt install nginx -y

# 安装Certbot（Let's Encrypt客户端）
apt install certbot python3-certbot-nginx -y
```

**如果是 CentOS/RHEL 系统（使用 yum）：**

```bash
# 安装Nginx（如果遇到 exclude 过滤错误，使用 --disableexcludes=all）
yum install -y nginx --disableexcludes=all

# 安装EPEL仓库（Certbot需要，如果已存在会提示，可忽略）
yum install -y epel-release

# 安装Certbot（Let's Encrypt客户端）
yum install -y certbot python3-certbot-nginx
```

### 步骤2：配置Nginx（HTTP）

创建Nginx配置文件：

**如果是 Debian/Ubuntu 系统：**

```bash
# 方法1：使用 vi 编辑器（推荐）
sudo vi /etc/nginx/sites-available/xhs-parser

# 方法2：直接创建文件（更简单）
sudo tee /etc/nginx/sites-available/xhs-parser > /dev/null <<EOF
server {
    listen 80;
    server_name www.egoistcookie.top;  # 替换为你的域名

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # 支持WebSocket（如果需要）
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF
```

**如果是 CentOS/RHEL 系统：**

```bash
# 方法1：使用 vi 编辑器
sudo vi /etc/nginx/conf.d/xhs-parser.conf

# 方法2：直接创建文件（更简单，推荐）
sudo tee /etc/nginx/conf.d/xhs-parser.conf > /dev/null <<EOF
server {
    listen 80;
    server_name www.egoistcookie.top;  # 替换为你的域名

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # 支持WebSocket（如果需要）
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF
```

**使用 vi 编辑器的基本操作：**
- 按 `i` 进入编辑模式
- 编辑完成后，按 `Esc` 退出编辑模式
- 输入 `:wq` 保存并退出，或 `:q!` 不保存退出

**注意**：如果使用方法1（vi编辑器），需要手动将上面的配置内容添加到文件中。

启用配置：

**如果是 Debian/Ubuntu 系统：**

```bash
# 创建软链接
sudo ln -s /etc/nginx/sites-available/xhs-parser /etc/nginx/sites-enabled/

# 删除默认配置（可选）
sudo rm /etc/nginx/sites-enabled/default

# 测试配置
sudo nginx -t

# 启动Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

**如果是 CentOS/RHEL 系统：**

```bash
# CentOS系统配置文件在 /etc/nginx/conf.d/ 目录，直接创建即可
# 无需创建软链接

# 测试配置
sudo nginx -t

# 启动Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 步骤3：申请SSL证书

```bash
# 申请证书（将 www.egoistcookie.top 替换为你的实际域名）
sudo certbot --nginx -d www.egoistcookie.top

# 按提示操作：
# 1. 输入邮箱地址（用于证书到期提醒）
# 2. 同意服务条款（输入 Y）
# 3. 选择是否接收邮件（可选，输入 Y 或 N）
# 4. Certbot会自动配置HTTPS
```

### 步骤4：验证HTTPS

```bash
# 测试HTTPS（将 www.egoistcookie.top 替换为你的实际域名）
curl https://www.egoistcookie.top/health

# 应该返回: {"status":"ok"}
```

### 步骤5：配置自动续期

Let's Encrypt证书有效期90天，需要自动续期：

```bash
# 测试续期
sudo certbot renew --dry-run

# 证书会自动续期（certbot已配置定时任务）
```

## 方案2：使用IP + 自签名证书（不推荐，微信小程序可能不接受）

如果只有IP没有域名，可以使用自签名证书，但**微信小程序可能不接受自签名证书**。

### 步骤1：生成自签名证书

```bash
# 创建证书目录
mkdir -p /etc/nginx/ssl
cd /etc/nginx/ssl

# 生成私钥
openssl genrsa -out xhs-parser.key 2048

# 生成证书（有效期365天）
openssl req -new -x509 -key xhs-parser.key -out xhs-parser.crt -days 365 \
  -subj "/C=CN/ST=State/L=City/O=Organization/CN=120.77.92.36"
```

### 步骤2：配置Nginx使用SSL

**如果是 Debian/Ubuntu 系统：**

```bash
# 方法1：使用 vi 编辑器
sudo vi /etc/nginx/sites-available/xhs-parser

# 方法2：直接创建文件（更简单）
sudo tee /etc/nginx/sites-available/xhs-parser > /dev/null <<EOF
server {
    listen 80;
    server_name 120.77.92.36;
    return 301 https://\$server_name\$request_uri;  # HTTP重定向到HTTPS
}

server {
    listen 443 ssl http2;
    server_name 120.77.92.36;

    ssl_certificate /etc/nginx/ssl/xhs-parser.crt;
    ssl_certificate_key /etc/nginx/ssl/xhs-parser.key;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
```

**如果是 CentOS/RHEL 系统：**

```bash
# 方法1：使用 vi 编辑器
sudo vi /etc/nginx/conf.d/xhs-parser.conf

# 方法2：直接创建文件（更简单，推荐）
sudo tee /etc/nginx/conf.d/xhs-parser.conf > /dev/null <<EOF
server {
    listen 80;
    server_name 120.77.92.36;
    return 301 https://\$server_name\$request_uri;  # HTTP重定向到HTTPS
}

server {
    listen 443 ssl http2;
    server_name 120.77.92.36;

    ssl_certificate /etc/nginx/ssl/xhs-parser.crt;
    ssl_certificate_key /etc/nginx/ssl/xhs-parser.key;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
```

**使用 vi 编辑器的基本操作：**
- 按 `i` 进入编辑模式
- 编辑完成后，按 `Esc` 退出编辑模式
- 输入 `:wq` 保存并退出，或 `:q!` 不保存退出

**注意**：如果使用方法1（vi编辑器），需要手动将上面的配置内容添加到文件中。

重启Nginx：

```bash
sudo nginx -t
sudo systemctl restart nginx
```

### 步骤3：配置防火墙

**如果是 Debian/Ubuntu 系统：**

```bash
# 使用ufw
ufw allow 80/tcp
ufw allow 443/tcp
ufw reload
```

**如果是 CentOS/RHEL 系统：**

```bash
# 使用firewalld
systemctl start firewalld
systemctl enable firewalld
firewall-cmd --permanent --add-port=80/tcp
firewall-cmd --permanent --add-port=443/tcp
firewall-cmd --reload

# 查看开放的端口
firewall-cmd --list-ports
```

## 方案3：使用云服务商免费SSL证书（推荐，如果没有域名）

### 阿里云/腾讯云等

1. 登录云服务商控制台
2. 申请免费SSL证书
3. 下载证书文件（Nginx格式）
4. 上传到服务器 `/etc/nginx/ssl/`
5. 配置Nginx使用证书

## 更新小程序配置

配置HTTPS后，更新小程序代码：

```javascript
// pages/index/index.js
apiBaseUrl: 'https://www.egoistcookie.top'  // 使用HTTPS域名（推荐）
// 或
apiBaseUrl: 'https://120.77.92.36'  // 如果使用IP+自签名证书（不推荐，微信小程序可能不接受）
```

## 配置微信小程序域名白名单

1. 登录 [微信公众平台](https://mp.weixin.qq.com/)
2. 进入 **开发** -> **开发管理** -> **开发设置** -> **服务器域名**
3. 在 **request合法域名** 中添加：
   - `https://www.egoistcookie.top`（推荐，使用你的实际域名）
   - 或 `https://120.77.92.36`（如果使用IP，但可能不被接受）

## 验证配置

```bash
# 测试HTTP（应该重定向到HTTPS，将域名替换为你的实际域名）
curl -I http://www.egoistcookie.top/health

# 测试HTTPS
curl https://www.egoistcookie.top/health

# 检查证书信息
openssl s_client -connect www.egoistcookie.top:443 -servername www.egoistcookie.top
```

## 常见问题

### 1. Certbot申请证书失败

**原因**：域名未正确解析或80端口被占用

**解决**：
```bash
# 检查域名解析（将域名替换为你的实际域名）
nslookup www.egoistcookie.top

# 检查80端口
netstat -tlnp | grep :80
# 或
ss -tlnp | grep :80

# 确保Nginx监听80端口
systemctl status nginx
```

### 2. 微信小程序仍提示协议头非法

**原因**：
- 证书不受信任（自签名证书）
- 域名未在微信小程序后台配置

**解决**：
- 使用Let's Encrypt等受信任的证书
- 确保在微信公众平台配置了正确的域名

### 3. Nginx配置错误

```bash
# 测试配置
sudo nginx -t

# 查看错误日志
sudo tail -f /var/log/nginx/error.log
```

## 快速配置脚本

创建 `setup-https.sh`（CentOS/RHEL版本，使用yum）：

```bash
#!/bin/bash
# HTTPS快速配置脚本（CentOS/RHEL，使用yum）

DOMAIN="www.egoistcookie.top"  # 修改为你的域名

echo "配置HTTPS for $DOMAIN..."

# 安装依赖（如果遇到 exclude 过滤错误，使用 --disableexcludes=all）
yum install -y nginx --disableexcludes=all
yum install -y epel-release
yum install -y certbot python3-certbot-nginx

# 配置Nginx（CentOS系统配置文件在 /etc/nginx/conf.d/）
cat > /etc/nginx/conf.d/xhs-parser.conf <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# 测试并重启Nginx
nginx -t && systemctl restart nginx
systemctl enable nginx

# 配置防火墙
systemctl start firewalld
systemctl enable firewalld
firewall-cmd --permanent --add-port=80/tcp
firewall-cmd --permanent --add-port=443/tcp
firewall-cmd --reload

# 申请SSL证书
certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email your-email@example.com

echo "HTTPS配置完成！"
echo "访问: https://$DOMAIN"
```

使用方法：

```bash
chmod +x setup-https.sh
sudo ./setup-https.sh
```

**注意**：如果是 Debian/Ubuntu 系统，请使用 `apt` 命令，配置文件路径为 `/etc/nginx/sites-available/`。
