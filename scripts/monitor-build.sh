#!/bin/bash

echo "🚀 Electron 打包进度监控"
echo "===================="
echo ""

while true; do
    clear
    echo "🚀 Electron 打包进度监控"
    echo "===================="
    echo ""
    echo "⏰ 当前时间: $(date '+%H:%M:%S')"
    echo ""

    # 检查 Electron Forge 进度
    if [ -f /tmp/electron-build.log ]; then
        echo "📝 最新日志 (最后 20 行):"
        echo "---"
        tail -20 /tmp/electron-build.log
        echo ""
    fi

    # 检查是否完成
    if [ -d "release-electron" ]; then
        echo "✅ 打包完成!"
        echo ""
        echo "📦 生成的安装包:"
        find release-electron -maxdepth 2 \( -name "*.dmg" -o -name "*.zip" -o -name "*.exe" -o -name "*.AppImage" -o -name "*.app" \) -print 2>/dev/null | while read -r artifact; do
            ls -lh "$artifact"
        done
        break
    fi

    # 检查进程是否还在运行
    if ! pgrep -f "electron-forge|electron:package:dir|electron:dist" > /dev/null; then
        echo "⚠️  打包进程已结束"
        break
    fi

    sleep 10
done

echo ""
echo "监控结束"
