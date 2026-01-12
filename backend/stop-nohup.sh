#!/bin/bash
# 停止使用nohup启动的Flask应用

PROJECT_DIR="/opt/xhs-parser"
PID_FILE="$PROJECT_DIR/app.pid"

if [ ! -f "$PID_FILE" ]; then
    echo "未找到PID文件，应用可能未运行"
    exit 1
fi

PID=$(cat $PID_FILE)

if ps -p $PID > /dev/null 2>&1; then
    echo "停止应用，PID: $PID"
    kill $PID
    
    # 等待进程结束
    sleep 2
    
    # 如果还在运行，强制杀死
    if ps -p $PID > /dev/null 2>&1; then
        echo "强制停止..."
        kill -9 $PID
    fi
    
    rm -f $PID_FILE
    echo "应用已停止"
else
    echo "进程不存在，清理PID文件"
    rm -f $PID_FILE
fi
