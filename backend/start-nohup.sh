#!/bin/bash
# 使用nohup启动Flask应用

# 项目目录
PROJECT_DIR="/opt/xhs-parser"
cd $PROJECT_DIR

# 日志文件
LOG_FILE="$PROJECT_DIR/app.log"
PID_FILE="$PROJECT_DIR/app.pid"

# 检查是否已经运行
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat $PID_FILE)
    if ps -p $OLD_PID > /dev/null 2>&1; then
        echo "应用已在运行中，PID: $OLD_PID"
        echo "如需重启，请先运行: ./stop-nohup.sh"
        exit 1
    else
        echo "清理旧的PID文件"
        rm -f $PID_FILE
    fi
fi

# 启动应用
echo "启动Flask应用..."
nohup python3 app.py > $LOG_FILE 2>&1 &
PID=$!

# 保存PID
echo $PID > $PID_FILE

echo "应用已启动，PID: $PID"
echo "日志文件: $LOG_FILE"
echo "查看日志: tail -f $LOG_FILE"
echo "停止应用: kill $PID 或运行 ./stop-nohup.sh"
