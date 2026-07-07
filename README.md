# 手绘小怪物乐园

纯 HTML/CSS/JS 小游戏合集，双击 `index.html` 本地可玩，也可部署到 GitHub Pages 用域名访问。

## 本地玩

直接用浏览器打开 `index.html` 即可（无需服务器）。

## 部署到 GitHub + 自定义域名

### 第一步：创建 GitHub 仓库

建议**仓库根目录就是本项目**（把 `happy_web_game` 文件夹里的内容作为仓库根，不要多包一层目录）。

```bash
cd happy_web_game
git init
git add .
git commit -m "Initial commit: happy web game"
git branch -M main
git remote add origin https://github.com/你的用户名/happy-web-game.git
git push -u origin main
```

> 素材 PNG 和 `bgm.mp3` 体积较大，首次 push 可能稍慢，属正常情况。

### 第二步：开启 GitHub Pages

1. 打开仓库 → **Settings** → **Pages**
2. **Source** 选 **Deploy from a branch**
3. **Branch** 选 `main`，文件夹选 **`/ (root)`**
4. 保存后等 1～3 分钟

默认访问地址：

`https://你的用户名.github.io/happy-web-game/`

若仓库名是 `你的用户名.github.io`，则地址为 `https://你的用户名.github.io/`。

### 第三步：绑定自己的域名

#### 3.1 在仓库里添加 CNAME

在项目根目录创建文件 `CNAME`（只写一行，不要 `https://`）：

```
game.你的域名.com
```

提交并 push 后，GitHub Pages 设置里会出现 Custom domain。

#### 3.2 在域名服务商配置 DNS

**方式 A（推荐）：子域名**

例如域名 `example.com`，想用 `game.example.com`：

| 类型  | 主机记录 | 值 |
|-------|----------|-----|
| CNAME | game     | `你的用户名.github.io` |

**方式 B：根域名（apex）**

例如直接用 `example.com`：

| 类型 | 主机记录 | 值 |
|------|----------|-----|
| A    | @        | `185.199.108.153` |
| A    | @        | `185.199.109.153` |
| A    | @        | `185.199.110.153` |
| A    | @        | `185.199.111.153` |

（以上为 GitHub Pages 官方 A 记录，以 [GitHub 文档](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site) 为准。）

#### 3.3 等待生效

DNS 通常 5 分钟～48 小时生效。GitHub Pages 设置里勾选 **Enforce HTTPS**（证书自动申请）。

### 第四步：验证

浏览器打开你的域名，应能看到游戏菜单；点「大嘴接怪」能正常加载图片和音效。

---

## 项目结构

```
index.html          # 游戏菜单
games/catch.html    # 大嘴接怪
games/whack.html    # 森林躲猫猫
js/                 # 游戏逻辑与音效
css/                # 样式
assets/sprites/     # 手绘素材
assets/audio/       # 背景音乐与音效
```

## 音效出处

见 `assets/audio/AUDIO_CREDITS.md`。
