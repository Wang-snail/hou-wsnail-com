#!/usr/bin/env bash
# 本机一次性修复：Cursor「无法在合理的时间内解析 shell 环境」
# 用法：在 Mac/Linux 本机终端执行：
#   bash fix-cursor-shell-env.sh
set -euo pipefail

echo "==> 1) 提高 Cursor shell 环境解析超时"

detect_settings() {
  if [[ "$(uname -s)" == "Darwin" ]]; then
    echo "$HOME/Library/Application Support/Cursor/User/settings.json"
  else
    echo "$HOME/.config/Cursor/User/settings.json"
  fi
}

SETTINGS="$(detect_settings)"
mkdir -p "$(dirname "$SETTINGS")"
if [[ ! -f "$SETTINGS" ]]; then
  echo '{}' > "$SETTINGS"
fi

cp "$SETTINGS" "${SETTINGS}.bak.$(date +%Y%m%d%H%M%S)"

python3 - "$SETTINGS" <<'PY'
import json, sys, re
path = sys.argv[1]
raw = open(path, encoding="utf-8").read()
# 去掉 // 与 /* */ 注释，便于解析 Cursor/VS Code JSONC
raw = re.sub(r"/\*.*?\*/", "", raw, flags=re.S)
raw = re.sub(r"(^|[^:])//.*?$", r"\1", raw, flags=re.M)
raw = raw.strip() or "{}"
try:
    data = json.loads(raw)
except json.JSONDecodeError:
    # 极端情况下保留原文件，追加无法解析则失败退出
    print("settings.json 解析失败，请手动打开 User Settings JSON 添加超时项", file=sys.stderr)
    sys.exit(1)
data["application.shellEnvironmentResolutionTimeout"] = 60
open(path, "w", encoding="utf-8").write(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
print("已写入:", path)
print('  application.shellEnvironmentResolutionTimeout = 60')
PY

echo
echo "==> 2) 给 shell 启动脚本加快速跳过（Cursor 解析环境时）"

patch_rc() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  if grep -q 'VSCODE_RESOLVING_ENVIRONMENT' "$file" 2>/dev/null; then
    echo "已存在跳过逻辑，跳过: $file"
    return 0
  fi
  cp "$file" "${file}.bak.$(date +%Y%m%d%H%M%S)"
  local tmp
  tmp="$(mktemp)"
  cat > "$tmp" <<'EOF'
# >>> cursor-shell-env-fix (auto) >>>
# Cursor/VS Code 解析环境变量时跳过重逻辑，避免超时弹窗
if [ -n "${VSCODE_RESOLVING_ENVIRONMENT:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
# <<< cursor-shell-env-fix (auto) <<<

EOF
  cat "$file" >> "$tmp"
  # nvm 加速：加上 --no-use（若尚未加）
  if grep -q 'nvm\.sh"' "$tmp" && ! grep -q 'nvm\.sh".*--no-use' "$tmp"; then
    sed -i.bak-nvm -E 's|(\. "?\$\{?NVM_DIR\}?/nvm\.sh"?)( *)|\1 --no-use\2|g' "$tmp" 2>/dev/null \
      || sed -i '' -E 's|(\[[^]]*nvm\.sh[^]]*\] && \\?\. "?\$NVM_DIR/nvm\.sh"?)|\1 --no-use|g' "$tmp" || true
  fi
  mv "$tmp" "$file"
  echo "已修补: $file"
}

# zsh / bash 常见启动文件
for f in \
  "$HOME/.zshrc" \
  "$HOME/.zprofile" \
  "$HOME/.bashrc" \
  "$HOME/.bash_profile" \
  "$HOME/.profile"
do
  patch_rc "$f" || true
done

echo
echo "==> 3) 测量当前 shell 启动耗时"
SHELL_NAME="$(basename "${SHELL:-/bin/zsh}")"
if command -v "$SHELL_NAME" >/dev/null 2>&1; then
  time "$SHELL_NAME" -i -c exit 2>&1 || true
fi

echo
echo "完成。请务必完全退出 Cursor 再打开："
echo "  macOS: Cmd+Q"
echo "  然后再从 Dock 启动，或在本机终端执行: cursor ."
echo
echo "若仍弹窗，把上面 time 输出发我即可继续排查。"
