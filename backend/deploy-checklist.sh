#!/bin/bash
# 域名审核期间部署准备检查清单脚本

echo "========================================="
echo "域名审核期间部署准备检查清单"
echo "域名: www.egoistcookie.top"
echo "========================================="
echo ""

# 1. 检查Python环境
echo "1. 检查Python环境..."
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    echo "   ✅ Python已安装: $PYTHON_VERSION"
else
    echo "   ❌ Python3未安装"
fi
echo ""

# 2. 检查Nginx
echo "2. 检查Nginx..."
if command -v nginx &> /dev/null; then
    NGINX_VERSION=$(nginx -v 2>&1)
    echo "   ✅ Nginx已安装: $NGINX_VERSION"
    
    # 检查Nginx配置
    if sudo nginx -t 2>&1 | grep -q "successful"; then
        echo "   ✅ Nginx配置有效"
    else
        echo "   ⚠️  Nginx配置有问题，请检查"
    fi
else
    echo "   ❌ Nginx未安装"
fi
echo ""

# 3. 检查端口占用
echo "3. 检查端口占用..."
if netstat -tlnp 2>/dev/null | grep -q ":80 "; then
    echo "   ✅ 80端口已监听（HTTP）"
else
    echo "   ⚠️  80端口未监听"
fi

if netstat -tlnp 2>/dev/null | grep -q ":443 "; then
    echo "   ✅ 443端口已监听（HTTPS）"
else
    echo "   ⚠️  443端口未监听（等SSL配置后会有）"
fi

if netstat -tlnp 2>/dev/null | grep -q ":5000 "; then
    echo "   ✅ 5000端口已监听（后端服务）"
else
    echo "   ⚠️  5000端口未监听（后端服务未启动）"
fi
echo ""

# 4. 检查后端依赖
echo "4. 检查后端依赖..."
if [ -f "requirements-basic.txt" ]; then
    echo "   ✅ requirements-basic.txt 存在"
    MISSING_DEPS=$(pip3 list 2>/dev/null | grep -E "Flask|flask-cors|requests" | wc -l)
    if [ "$MISSING_DEPS" -ge 3 ]; then
        echo "   ✅ 基础依赖已安装"
    else
        echo "   ⚠️  部分依赖可能未安装，运行: pip3 install -r requirements-basic.txt"
    fi
else
    echo "   ❌ requirements-basic.txt 不存在"
fi
echo ""

# 5. 检查systemd服务
echo "5. 检查systemd服务..."
if systemctl list-unit-files | grep -q "xhs-parser.service"; then
    SERVICE_STATUS=$(systemctl is-active xhs-parser 2>/dev/null)
    if [ "$SERVICE_STATUS" = "active" ]; then
        echo "   ✅ xhs-parser服务正在运行"
    else
        echo "   ⚠️  xhs-parser服务未运行，运行: sudo systemctl start xhs-parser"
    fi
else
    echo "   ⚠️  xhs-parser服务未配置"
fi
echo ""

# 6. 检查DNS解析（需要域名审核通过）
echo "6. 检查DNS解析..."
if nslookup www.egoistcookie.top &> /dev/null; then
    DNS_RESULT=$(nslookup www.egoistcookie.top 2>/dev/null | grep "Address:" | tail -1)
    echo "   ✅ DNS解析正常: $DNS_RESULT"
else
    echo "   ⚠️  DNS解析失败（域名可能还在审核中）"
fi
echo ""

# 7. 检查SSL证书（需要域名审核通过）
echo "7. 检查SSL证书..."
if [ -d "/etc/letsencrypt/live/www.egoistcookie.top" ]; then
    echo "   ✅ SSL证书目录存在"
    if [ -f "/etc/letsencrypt/live/www.egoistcookie.top/fullchain.pem" ]; then
        echo "   ✅ SSL证书文件存在"
    else
        echo "   ⚠️  SSL证书文件不存在"
    fi
else
    echo "   ⚠️  SSL证书未配置（等域名审核通过后运行: sudo certbot --nginx -d www.egoistcookie.top）"
fi
echo ""

# 8. 检查防火墙
echo "8. 检查防火墙..."
if command -v ufw &> /dev/null; then
    UFW_STATUS=$(sudo ufw status 2>/dev/null | head -1)
    echo "   $UFW_STATUS"
    
    if echo "$UFW_STATUS" | grep -q "Status: active"; then
        if sudo ufw status | grep -q "80/tcp"; then
            echo "   ✅ 80端口已开放"
        else
            echo "   ⚠️  80端口未开放，运行: sudo ufw allow 80/tcp"
        fi
        
        if sudo ufw status | grep -q "443/tcp"; then
            echo "   ✅ 443端口已开放"
        else
            echo "   ⚠️  443端口未开放，运行: sudo ufw allow 443/tcp"
        fi
    fi
else
    echo "   ⚠️  ufw未安装（或使用其他防火墙）"
fi
echo ""

# 9. 检查后端代码
echo "9. 检查后端代码..."
if [ -f "app.py" ]; then
    echo "   ✅ app.py 存在"
    
    # 检查关键功能
    if grep -q "doubao" app.py; then
        echo "   ✅ 豆包解析功能已实现"
    else
        echo "   ⚠️  豆包解析功能可能未实现"
    fi
    
    if grep -q "/api/doubao_cookie" app.py; then
        echo "   ✅ Cookie管理接口已实现"
    else
        echo "   ⚠️  Cookie管理接口可能未实现"
    fi
else
    echo "   ❌ app.py 不存在"
fi
echo ""

echo "========================================="
echo "检查完成！"
echo ""
echo "下一步操作："
echo "1. 等待域名审核通过"
echo "2. 配置DNS解析"
echo "3. 配置SSL证书"
echo "4. 更新小程序域名白名单"
echo "========================================="
