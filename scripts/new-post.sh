#!/bin/bash

# Step 1: 获取文件名
read -p "请输入文件名（不包括扩展名）: " filename

# Step 2: 选择文件格式
read -p "请选择文件格式（输入 'md' 或 'mdx'): " extension
while [[ "$extension" != "md" && "$extension" != "mdx" ]]; do
  echo "无效的格式，请重新输入。"
  read -p "请选择文件格式（输入 'md' 或 'mdx'): " extension
done

# Step 3: 选择文件创建的位置
# ⚠️ 默认落点是内容仓，不是 src/content/article —— 后者被 .gitignore 忽略，
# 是构建从内容仓 cp 进来的缓存，写在那里下次构建就被覆盖、也提交不了。
echo "提示：真实内容在内容仓 zcblog-articles，这里只是构建缓存（已 gitignore）。"
read -p "请输入文件创建的位置（默认目录 '../zcblog-articles'): " filepath
if [ -z "$filepath" ]; then
  filepath="../zcblog-articles"
fi

# 创建目录（如果不存在）
mkdir -p "$filepath"

# 完整文件路径
fullpath="$filepath/$filename.$extension"

# Step 4: 是否写入默认formatter
read -p "是否写入默认formatter (输入 'Yes' 或 'No'): " write_formatter
write_formatter=$(echo "$write_formatter" | tr '[:upper:]' '[:lower:]')
while [[ "$write_formatter" != "yes" && "$write_formatter" != "no" && "$write_formatter" != "y" && "$write_formatter" != "n" ]]; do
  echo "无效的输入，请重新输入。"
  read -p "是否写入默认formatter (输入 'Yes' 或 'No'): " write_formatter
  write_formatter=$(echo "$write_formatter" | tr '[:upper:]' '[:lower:]')
done

# Step 5: 根据选择写入默认formatter
if [[ "$write_formatter" == "yes" || "$write_formatter" == "y" ]]; then
  cat <<EOL > "$fullpath"
---
title: $filename
description: $filename
pubDate: $(date +%F)
tags: ['']
image:
  url: 
  alt: 
sticky: 0
waline: false
---
EOL
else
  touch "$fullpath"
fi

echo "文件已创建: $fullpath"
