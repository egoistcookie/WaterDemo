#!/bin/bash
# CentOS系统快速安装脚本

set -e

echo "=========================================="
echo "CentOS系统安装脚本"
echo "=========================================="

# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then 
    echo "请使用root用户运行此脚本"
    exit 1
fi

# 检测系统版本
if command -v dnf &> /dev/null; then
    PKG_MGR="dnf"
    echo "检测到 CentOS 8/9 或 RHEL 8/9，使用 dnf"
elif command -v yum &> /dev/null; then
    PKG_MGR="yum"
    echo "检测到 CentOS 7 或 RHEL 7，使用 yum"
else
    echo "错误：未检测到包管理器"
    exit 1
fi

# 更新系统
echo "1. 更新系统..."
$PKG_MGR update -y

# 安装Python3
echo "2. 安装Python3..."
$PKG_MGR install -y python3 python3-pip

# 检查EPEL仓库（如果已安装 epel-aliyuncs-release，不需要再安装 epel-release）
echo "3. 检查EPEL仓库..."
if $PKG_MGR list installed | grep -q "epel.*release"; then
    echo "EPEL仓库已存在（可能是阿里云版本）"
else
    echo "安装EPEL仓库..."
    $PKG_MGR install -y epel-release 2>/dev/null || echo "EPEL安装失败，可能已存在"
fi

# 更新仓库缓存
echo "4. 更新仓库缓存..."
$PKG_MGR makecache

# 安装Nginx
echo "5. 安装Nginx..."
$PKG_MGR install -y nginx

# 安装Certbot（EPEL已在上面安装）
echo "6. 安装Certbot..."
$PKG_MGR install -y certbot python3-certbot-nginx

# 安装防火墙工具
echo "7. 安装防火墙工具..."
$PKG_MGR install -y firewalld

# 启动防火墙
echo "8. 配置防火墙..."
systemctl start firewalld
systemctl enable firewalld
firewall-cmd --permanent --add-port=80/tcp
firewall-cmd --permanent --add-port=443/tcp
firewall-cmd --permanent --add-port=5000/tcp
firewall-cmd --reload

# 启动Nginx
echo "9. 启动Nginx..."
systemctl start nginx
systemctl enable nginx

# 安装Python依赖
echo "10. 安装Python依赖..."
cd /opt/xhs-parser
pip3 install -r requirements-basic.txt
pip3 install gunicorn

echo ""
echo "=========================================="
echo "安装完成！"
echo "=========================================="
echo "下一步："
echo "1. 配置Nginx: nano /etc/nginx/conf.d/xhs-parser.conf"
echo "2. 重启Nginx: systemctl restart nginx"
echo "3. 启动服务: systemctl start xhs-parser"
echo "=========================================="
