#!/usr/bin/env bash
# ==============================================================================
# {{brand_name}} CLI (skillnav) 一键安装与配置脚本
# 部署后访问：{{web_url}}/install（勿直接改 apps/web/public/install）
# 规范与特性：
# 1. 自动判定环境并安装 CLI（PyPI 优先，10s 超时后回退阿里云镜像；兼容 pipx、PEP 668）
# 2. 自动探测安装路径并修复 PATH（自动写入 ~/.zshrc 或 ~/.bash_profile）
# 3. 自动配置与测试平台 Registry（支持多 profile / 强制覆盖）
# 4. 支持传参 --api-key 自动完成登录与 whoami 身份验证，或在终端交互输入
# ==============================================================================

set -e

REGISTRY_URL="{{registry_api_url}}"
WEB_URL="{{web_url}}"
PIP_INDEX_PYPI="https://pypi.org/simple"
PIP_INDEX_ALIYUN="https://mirrors.aliyun.com/pypi/simple/"
PIP_INSTALL_TIMEOUT=10
API_KEY=""

# ------------------------------------------------------------------------------
# 0. 解析输入参数（支持 --api-key sk_...）
# ------------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --api-key)
            API_KEY="$2"
            shift 2
            ;;
        --registry)
            REGISTRY_URL="$2"
            shift 2
            ;;
        -h|--help)
            echo "用法: curl -fsSL ${WEB_URL}/install | bash -s -- [选项]"
            echo ""
            echo "选项:"
            echo "  --api-key <KEY>     可选，自动完成登录验证（在 Web 端「设置 → API 密钥」获取）"
            echo "  --registry <URL>    可选，自定义 Registry API 地址（默认: $REGISTRY_URL）"
            echo "  -h, --help          显示帮助信息"
            exit 0
            ;;
        *)
            echo "⚠️ 未知参数: $1"
            shift
            ;;
    esac
done

# 写入 profile registry：优先 --registry（Python 3.12+ / 较新 Typer）；
# 部分 macOS Python 3.9 环境子命令 --registry 与全局选项冲突，回退为位置参数。
skillnav_config_add_profile() {
    local profile_name="$1"
    local registry_url="$2"

    if skillnav config add "$profile_name" --registry "$registry_url" 2>/dev/null; then
        return 0
    fi
    if skillnav config add "$profile_name" "$registry_url" 2>/dev/null; then
        echo "  ℹ️  已通过位置参数写入 Registry（当前 Python/Typer 环境）。"
        return 0
    fi

    echo "❌ 无法配置 Registry profile '$profile_name'。" >&2
    echo "   请手动尝试：" >&2
    echo "     skillnav config add $profile_name --registry \"$registry_url\"" >&2
    echo "     或 skillnav config add $profile_name \"$registry_url\"" >&2
    return 1
}

# pip / pipx 安装 skillnav：指定 index 与超时（秒）。
skillnav_install_via_pip() {
    local index_url="$1"
    python3 -m pip install --user -i "$index_url" --timeout "$PIP_INSTALL_TIMEOUT" \
        --break-system-packages skillnav 2>/dev/null || \
    python3 -m pip install --user -i "$index_url" --timeout "$PIP_INSTALL_TIMEOUT" skillnav
}

skillnav_install_via_pipx() {
    local index_url="$1"
    pipx install skillnav --force \
        --pip-args="-i ${index_url} --timeout ${PIP_INSTALL_TIMEOUT}"
}

try_install_skillnav() {
    local index_url="$1"
    local label="$2"
    echo "  -> 正在从 ${label} 安装 (超时 ${PIP_INSTALL_TIMEOUT}s)..."
    if command -v pipx &>/dev/null; then
        echo "  -> 使用 pipx 隔离环境..."
        skillnav_install_via_pipx "$index_url"
    elif command -v python3 &>/dev/null; then
        echo "  -> 使用 python3 -m pip --user..."
        skillnav_install_via_pip "$index_url"
    else
        echo "❌ 错误: 未检测到 Python3 或 pipx，请先安装 Python 环境。" >&2
        exit 1
    fi
}

echo "=================================================="
echo "🚀 欢迎使用 {{brand_name}} 一键安装引导"
echo "=================================================="
echo ""

# ------------------------------------------------------------------------------
# 1. 自动判定并安装 CLI
# ------------------------------------------------------------------------------
echo "📦 [1/4] 检查环境并安装 skillnav CLI..."

if try_install_skillnav "$PIP_INDEX_PYPI" "PyPI"; then
    :
elif try_install_skillnav "$PIP_INDEX_ALIYUN" "阿里云 PyPI 镜像"; then
    echo "  ℹ️  PyPI 不可用或超时，已改用阿里云镜像完成安装。"
else
    echo "❌ 错误: 连接超时，PyPI 与阿里云镜像均无法在 ${PIP_INSTALL_TIMEOUT}s 内完成安装。" >&2
    echo "   请检查网络、代理或 VPN，或手动安装: pip install skillnav -i ${PIP_INDEX_ALIYUN}" >&2
    exit 1
fi

echo "  -> skillnav 安装步骤完成。"
echo ""

# ------------------------------------------------------------------------------
# 2. 自动探测并修复 PATH
# ------------------------------------------------------------------------------
echo "🔍 [2/4] 探测可执行文件路径与配置 PATH..."

PY_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null || echo "3.9")

# 候选目录列表（覆盖 macOS 与 Linux 常见 user bin 目录）
POSSIBLE_PATHS=(
    "$HOME/Library/Python/${PY_VER}/bin"
    "$HOME/Library/Python/3.9/bin"
    "$HOME/Library/Python/3.10/bin"
    "$HOME/Library/Python/3.11/bin"
    "$HOME/Library/Python/3.12/bin"
    "$HOME/Library/Python/3.13/bin"
    "$HOME/Library/Python/3.14/bin"
    "$HOME/.local/bin"
    "/opt/homebrew/bin"
    "/usr/local/bin"
)

FOUND_BIN=""

# 如果当前已经在 PATH 里直接能找到
if command -v skillnav &>/dev/null; then
    FOUND_BIN="$(dirname "$(command -v skillnav)")"
else
    for p in "${POSSIBLE_PATHS[@]}"; do
        if [ -f "$p/skillnav" ]; then
            FOUND_BIN="$p"
            break
        fi
    done
fi

if [ -n "$FOUND_BIN" ]; then
    export PATH="$FOUND_BIN:$PATH"

    # 判定用户使用的 Shell 配置文件
    SHELL_NAME="$(basename "${SHELL:-zsh}")"
    TARGET_RC="$HOME/.zshrc"
    if [ "$SHELL_NAME" = "bash" ]; then
        if [ -f "$HOME/.bash_profile" ]; then
            TARGET_RC="$HOME/.bash_profile"
        else
            TARGET_RC="$HOME/.bashrc"
        fi
    fi

    # 检查是否已包含在配置文件中
    if ! grep -q "$FOUND_BIN" "$TARGET_RC" 2>/dev/null; then
        echo "" >> "$TARGET_RC"
        echo "# Added by {{brand_name}} installer" >> "$TARGET_RC"
        echo "export PATH=\"$FOUND_BIN:\$PATH\"" >> "$TARGET_RC"
        echo "  ✅ 已将 $FOUND_BIN 自动追加写入到 $TARGET_RC"
    else
        echo "  ℹ️  $TARGET_RC 中已存在该路径配置"
    fi
else
    echo "⚠️ 未在预期目录找到 skillnav，后续命令可能需要手动指定绝对路径。"
fi

# 二次确认 CLI 是否可用
if ! command -v skillnav &>/dev/null; then
    echo "❌ 无法调用 skillnav，请检查安装结果。"
    exit 1
fi

echo "  ✅ CLI 验证成功！当前版本: $(skillnav --version 2>&1 | tr -d '\n')"
echo ""

# ------------------------------------------------------------------------------
# 3. 自动配置 Registry
# ------------------------------------------------------------------------------
echo "⚙️  [3/4] 配置 Registry 地址..."
echo "  -> Registry API: $REGISTRY_URL"

# 添加或更新 default profile
skillnav_config_add_profile default "$REGISTRY_URL"
skillnav config use default 2>/dev/null || true

# 测试连通性
echo "  -> 正在测试与平台的连通性..."
if skillnav config test; then
    echo "  ✅ Registry 连通正常。"
else
    echo "  ⚠️ Registry 连通性测试未通过，请检查网络（或是否需要开启内网代理/VPN）。"
fi
echo ""

# ------------------------------------------------------------------------------
# 4. 自动完成登录与验证
# ------------------------------------------------------------------------------
echo "🔑 [4/4] 账号登录与身份验证..."

# 如果没有通过参数传递 API Key，则进行友好交互引导
if [ -z "$API_KEY" ]; then
    echo "  尚未提供 API 密钥。"
    echo "  请访问: $WEB_URL"
    echo "  进入「设置 → API 密钥」生成您的 Token (格式如: sk_...)"
    echo ""
    if [ -t 0 ]; then
        read -r -p "  请输入您的 API 密钥 (留空跳过): " INPUT_KEY
        API_KEY="$INPUT_KEY"
    fi
fi

if [ -n "$API_KEY" ]; then
    echo "  -> 正在登录..."
    if skillnav login --api-key "$API_KEY"; then
        echo "  ✅ 登录成功！当前身份信息："
        skillnav whoami
    else
        echo "  ❌ 登录验证失败，请确认 API Key 是否正确有效。"
    fi
else
    echo "  ℹ️  已跳过自动登录。后续可随时运行以下命令登录："
    echo "     skillnav login --api-key <您的Key>"
fi

echo ""
echo "=================================================="
echo "🎉 {{brand_name}} 安装与配置流程已全部就绪！"
echo "=================================================="
echo "👉 请在新打开的终端窗口中使用 skillnav"
echo "   或者在当前窗口运行: source ~/.zshrc"
echo "常用命令："
echo "  • 查看帮助:    skillnav --help"
echo "  • 检查身份:    skillnav whoami"
echo "  • 搜索技能:    skillnav search <关键词>"
echo "  • 发布技能:    skillnav publish"
echo "=================================================="
