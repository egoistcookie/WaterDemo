#!/bin/bash
# 小红书解析服务快速部署脚本

set -e

echo "=========================================="
echo "小红书解析服务部署脚本"
echo "=========================================="

# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then 
    echo "请使用root用户运行此脚本"
    exit 1
fi

# 项目目录
PROJECT_DIR="/opt/xhs-parser"
SERVICE_NAME="xhs-parser"

echo "1. 创建项目目录..."
mkdir -p $PROJECT_DIR
cd $PROJECT_DIR

echo "2. 检查Python环境..."
if ! command -v python3 &> /dev/null; then
    echo "安装Python3..."
    apt update
    apt install -y python3 python3-pip
fi

echo "3. 安装Python依赖..."
pip3 install -r requirements-basic.txt
pip3 install gunicorn

echo "4. 创建systemd服务文件..."
cat > /etc/systemd/system/${SERVICE_NAME}.service <<EOF
[Unit]
Description=Xiaohongshu Parser Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${PROJECT_DIR}
Environment="PATH=/usr/local/bin:/usr/bin:/bin"
ExecStart=$(which gunicorn) -w 4 -b 0.0.0.0:5000 app:app
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "5. 配置防火墙..."
if command -v ufw &> /dev/null; then
    ufw allow 5000/tcp
    echo "已配置ufw防火墙"
elif command -v firewall-cmd &> /dev/null; then
    firewall-cmd --permanent --add-port=5000/tcp
    firewall-cmd --reload
    echo "已配置firewalld防火墙"
else
    echo "未检测到防火墙，请手动配置端口5000"
fi

echo "6. 启动服务..."
systemctl daemon-reload
systemctl enable ${SERVICE_NAME}
systemctl start ${SERVICE_NAME}

echo "7. 检查服务状态..."
sleep 2
systemctl status ${SERVICE_NAME} --no-pager

echo ""
echo "=========================================="
echo "部署完成！"
echo "=========================================="
echo "服务地址: http://120.77.92.36:5000"
echo "健康检查: curl http://120.77.92.36:5000/health"
echo ""
echo "常用命令："
echo "  查看状态: systemctl status ${SERVICE_NAME}"
echo "  查看日志: journalctl -u ${SERVICE_NAME} -f"
echo "  重启服务: systemctl restart ${SERVICE_NAME}"
echo "  停止服务: systemctl stop ${SERVICE_NAME}"
echo "=========================================="
