# 后端服务部署指南

## 服务器信息
- IP: 120.77.92.36
- 需要开放端口: 5000（或使用nginx反向代理到80/443）

## 部署步骤

### 1. 连接服务器

```bash
ssh root@120.77.92.36
# 或使用你的用户名
ssh username@120.77.92.36
```

### 2. 安装Python环境

**如果是 Debian/Ubuntu 系统：**

```bash
# 更新系统
apt update && apt upgrade -y

# 安装Python3和pip（如果未安装）
apt install python3 python3-pip -y

# 验证安装
python3 --version
pip3 --version
```

**如果是 CentOS/RHEL 系统（如果遇到 `apt: command not found` 错误）：**

```bash
# CentOS 7
yum update -y
yum install -y python3 python3-pip

# CentOS 8/9
dnf update -y
dnf install -y python3 python3-pip

# 验证安装
python3 --version
pip3 --version
```

**详细CentOS安装指南请参考：`INSTALL_CENTOS.md`**

### 3. 创建项目目录

```bash
# 创建项目目录
mkdir -p /opt/xhs-parser
cd /opt/xhs-parser

# 或者使用其他目录，如 /home/yourname/xhs-parser
```

### 4. 上传代码到服务器

**方法1：使用scp上传（从本地）**

```bash
# 在本地电脑执行（Windows PowerShell或CMD）
scp -r backend/* root@120.77.92.36:/opt/xhs-parser/
```

**方法2：使用git（推荐）**

```bash
# 在服务器上
cd /opt/xhs-parser
git clone <your-repo-url> .
# 或直接下载zip文件并解压
```

**方法3：手动创建文件**

在服务器上直接创建文件，复制代码内容。

### 5. 安装依赖

```bash
cd /opt/xhs-parser
pip3 install -r requirements-basic.txt

# 或直接安装
pip3 install Flask flask-cors requests
```

### 6. 测试运行

```bash
cd /opt/xhs-parser
python3 app.py
```

如果看到服务启动信息，按 `Ctrl+C` 停止，然后使用生产级服务器运行。

### 7. 使用Gunicorn运行（生产环境）

```bash
# 安装gunicorn
pip3 install gunicorn

# 启动服务（前台运行，用于测试）
gunicorn -w 4 -b 0.0.0.0:5000 app:app

# 如果成功，按Ctrl+C停止，然后使用systemd后台运行
```

### 8. 配置systemd服务（自动启动）

创建服务文件：

```bash
sudo nano /etc/systemd/system/xhs-parser.service
```

添加以下内容：

```ini
[Unit]
Description=Xiaohongshu Parser Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/xhs-parser
Environment="PATH=/usr/bin:/usr/local/bin"
ExecStart=/usr/local/bin/gunicorn -w 4 -b 0.0.0.0:5000 app:app
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**注意**：如果gunicorn不在 `/usr/local/bin/gunicorn`，使用 `which gunicorn` 查找路径。

启动服务：

```bash
# 重载systemd配置
sudo systemctl daemon-reload

# 启动服务
sudo systemctl start xhs-parser

# 设置开机自启
sudo systemctl enable xhs-parser

# 查看状态
sudo systemctl status xhs-parser

# 查看日志
sudo journalctl -u xhs-parser -f
```

### 9. 配置防火墙

**如果是 Debian/Ubuntu 系统：**

```bash
# 使用ufw
ufw allow 5000/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw reload
```

**如果是 CentOS/RHEL 系统：**

```bash
# 使用firewalld
systemctl start firewalld
systemctl enable firewalld
firewall-cmd --permanent --add-port=5000/tcp
firewall-cmd --permanent --add-port=80/tcp
firewall-cmd --permanent --add-port=443/tcp
firewall-cmd --reload

# 查看开放的端口
firewall-cmd --list-ports
```

### 10. 配置Nginx反向代理（推荐，使用80/443端口）

**如果是 Debian/Ubuntu 系统：**

```bash
apt install nginx -y
```

**如果是 CentOS/RHEL 系统：**

```bash
# CentOS 7
yum install -y nginx

# CentOS 8/9
dnf install -y nginx
```

创建nginx配置：

**如果是 Debian/Ubuntu 系统：**

```bash
sudo nano /etc/nginx/sites-available/xhs-parser
```

**如果是 CentOS/RHEL 系统：**

```bash
sudo nano /etc/nginx/conf.d/xhs-parser.conf
```

添加以下内容：

```nginx
server {
    listen 80;
    server_name 120.77.92.36;  # 或你的域名

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用配置：

**如果是 Debian/Ubuntu 系统：**

```bash
# 创建软链接
sudo ln -s /etc/nginx/sites-available/xhs-parser /etc/nginx/sites-enabled/

# 删除默认配置（可选）
sudo rm /etc/nginx/sites-enabled/default

# 测试配置
sudo nginx -t

# 重启nginx
sudo systemctl restart nginx
```

**如果是 CentOS/RHEL 系统：**

```bash
# CentOS系统配置文件在 /etc/nginx/conf.d/ 目录，直接创建即可
# 无需创建软链接

# 测试配置
sudo nginx -t

# 启动nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 11. 配置HTTPS（必须！微信小程序要求HTTPS）

**重要**：微信小程序要求使用HTTPS协议，不能使用HTTP！

#### 方案1：使用域名 + Let's Encrypt（推荐）

**如果是 Debian/Ubuntu 系统：**

```bash
# 安装certbot
apt install certbot python3-certbot-nginx -y
```

**如果是 CentOS/RHEL 系统：**

```bash
# 先安装EPEL仓库
yum install -y epel-release  # CentOS 7
# 或
dnf install -y epel-release  # CentOS 8/9

# 安装certbot
yum install -y certbot python3-certbot-nginx  # CentOS 7
# 或
dnf install -y certbot python3-certbot-nginx  # CentOS 8/9
```

# 申请证书（需要域名，将yourdomain.com替换为你的域名）
sudo certbot --nginx -d api.yourdomain.com

# 自动续期
sudo certbot renew --dry-run
```

详细步骤请参考 `HTTPS_SETUP.md` 文件，或使用快速配置脚本：

```bash
chmod +x setup-https.sh
sudo ./setup-https.sh
```

#### 方案2：使用IP + 自签名证书（不推荐）

如果只有IP没有域名，可以使用自签名证书，但**微信小程序可能不接受**。详细步骤请参考 `HTTPS_SETUP.md`。

### 12. 更新小程序配置

在小程序代码 `pages/index/index.js` 中修改：

```javascript
// 必须使用HTTPS！
apiBaseUrl: 'https://api.yourdomain.com'  // 使用域名（推荐）
// 或
apiBaseUrl: 'https://120.77.92.36'        // 使用IP（需要配置HTTPS，不推荐）
```

### 13. 配置微信小程序域名白名单

1. 登录 [微信公众平台](https://mp.weixin.qq.com/)
2. 进入 **开发** -> **开发管理** -> **开发设置** -> **服务器域名**
3. 在 **request合法域名** 中添加：
   - `https://api.yourdomain.com`（推荐，使用域名）
   - 或 `https://120.77.92.36`（如果使用IP+HTTPS，但可能不被接受）

**注意**：必须使用HTTPS协议，HTTP协议会被拒绝！

## 常用命令

```bash
# 查看服务状态
sudo systemctl status xhs-parser

# 启动服务
sudo systemctl start xhs-parser

# 停止服务
sudo systemctl stop xhs-parser

# 重启服务
sudo systemctl restart xhs-parser

# 查看日志
sudo journalctl -u xhs-parser -f

# 查看端口占用
netstat -tlnp | grep 5000
# 或
ss -tlnp | grep 5000
```

## 故障排查

### 1. 服务无法启动

```bash
# 检查Python和依赖
python3 --version
pip3 list | grep -i flask

# 手动运行查看错误
cd /opt/xhs-parser
python3 app.py
```

### 2. 无法访问服务

```bash
# 检查防火墙
ufw status
# 或
firewall-cmd --list-ports

# 检查服务是否运行
sudo systemctl status xhs-parser

# 检查端口监听
netstat -tlnp | grep 5000
```

### 3. 查看详细日志

```bash
# systemd日志
sudo journalctl -u xhs-parser -n 100

# 应用日志（如果配置了日志文件）
tail -f /opt/xhs-parser/logs/app.log
```

## 安全建议

1. **使用非root用户运行**（推荐）
2. **配置HTTPS**（生产环境必须）
3. **限制访问IP**（如果可能）
4. **定期更新依赖**
5. **配置日志轮转**

## 快速部署脚本

创建 `deploy.sh`：

```bash
#!/bin/bash
set -e

echo "开始部署小红书解析服务..."

# 安装依赖
pip3 install -r requirements-basic.txt
pip3 install gunicorn

# 创建systemd服务
cat > /etc/systemd/system/xhs-parser.service <<EOF
[Unit]
Description=Xiaohongshu Parser Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/xhs-parser
ExecStart=$(which gunicorn) -w 4 -b 0.0.0.0:5000 app:app
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# 启动服务
systemctl daemon-reload
systemctl enable xhs-parser
systemctl start xhs-parser

# 配置防火墙
ufw allow 5000/tcp

echo "部署完成！"
echo "服务地址: http://120.77.92.36:5000"
echo "查看状态: systemctl status xhs-parser"
```

使用方法：

```bash
chmod +x deploy.sh
sudo ./deploy.sh
```
