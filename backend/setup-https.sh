#!/bin/bash
# HTTPS快速配置脚本（需要域名）

set -e

echo "=========================================="
echo "HTTPS配置脚本"
echo "=========================================="

# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then 
    echo "请使用root用户运行此脚本"
    exit 1
fi

# 配置域名（请修改为你的域名）
read -p "请输入你的域名（如：api.yourdomain.com）: " DOMAIN

if [ -z "$DOMAIN" ]; then
    echo "错误：域名不能为空"
    exit 1
fi

echo "配置域名: $DOMAIN"

# 安装依赖
echo "1. 安装Nginx和Certbot..."
apt update
apt install -y nginx certbot python3-certbot-nginx

# 配置Nginx（HTTP）
echo "2. 配置Nginx..."
cat > /etc/nginx/sites-available/xhs-parser <<EOF
server {
    listen 80;
    server_name $DOMAIN;

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

# 启用配置
echo "3. 启用Nginx配置..."
ln -sf /etc/nginx/sites-available/xhs-parser /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# 测试配置
nginx -t

# 启动Nginx
systemctl restart nginx
systemctl enable nginx

# 配置防火墙
echo "4. 配置防火墙..."
if command -v ufw &> /dev/null; then
    ufw allow 80/tcp
    ufw allow 443/tcp
    echo "已配置ufw防火墙"
elif command -v firewall-cmd &> /dev/null; then
    firewall-cmd --permanent --add-port=80/tcp
    firewall-cmd --permanent --add-port=443/tcp
    firewall-cmd --reload
    echo "已配置firewalld防火墙"
fi

# 申请SSL证书
echo "5. 申请SSL证书..."
read -p "请输入邮箱地址（用于证书到期提醒）: " EMAIL

if [ -z "$EMAIL" ]; then
    echo "警告：未输入邮箱，使用默认邮箱"
    EMAIL="admin@$DOMAIN"
fi

certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email $EMAIL

# 测试HTTPS
echo "6. 测试HTTPS..."
sleep 2
curl -s https://$DOMAIN/health || echo "警告：HTTPS测试失败，请检查配置"

echo ""
echo "=========================================="
echo "HTTPS配置完成！"
echo "=========================================="
echo "HTTPS地址: https://$DOMAIN"
echo "健康检查: curl https://$DOMAIN/health"
echo ""
echo "请在小程序中更新API地址为: https://$DOMAIN"
echo "并在微信公众平台配置域名白名单"
echo "=========================================="
