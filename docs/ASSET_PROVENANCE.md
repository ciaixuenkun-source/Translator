# Translator 视觉资源来源说明

## 素材性质

当前应用图标、悬浮球、跳跃动画、背包前后层，以及普通模式和游戏模式的四方向贴边提示图，以《原神》可莉角色形象为基础，通过生成式 AI 和后期修改形成，属于非官方粉丝二次创作素材。

目前能够确认的是素材的上述性质及其在项目中的用途。现有资料不足以证明具体生成平台、生成日期或已经取得权利人的公开再分发授权，因此本说明不编造这些信息，也不把“免费”或“非商业”表述为授权依据。

## 文件清单与派生关系

- 悬浮球稳定状态：`src/renderer/assets/translator-mascot.png`
- 跳跃动画人物层：`src/renderer/assets/translator-jump-doll.png`
- 背包原始层：`src/renderer/assets/translator-empty-bag.png`
- 背包后层与前层：`src/renderer/assets/translator-bag-back.png`、`translator-bag-front.png`，由背包原始层通过项目脚本分层生成
- 普通模式四方向探头：`src/renderer/assets/peek-top.png`、`peek-bottom.png`、`peek-left.png`、`peek-right.png`，由跳跃动画人物层裁切和旋转生成
- 游戏模式四方向蓝色探头：对应的 `peek-*-game.png`，由普通模式探头局部改色生成
- 应用及窗口图标：`src/assets/icons/app-icon-source.png`、`app-icon-256.png`、`app-icon.ico`，由跳跃动画人物层裁切生成

`scripts/generate-bag-layers.js`、`scripts/generate-peek-assets.js`、`scripts/generate-game-eye-assets.js` 和 `scripts/generate-app-icons.js` 只负责从上述已有素材生成派生文件，不构成第三方角色素材的授权来源。

## 权利边界

本项目是独立开发的免费、非商业粉丝项目，与 HoYoverse 不存在官方合作、赞助或背书关系。《原神》及相关角色的知识产权归相应权利人所有。

根目录 MIT License 仅适用于项目有权按照 MIT 授权的程序代码，不适用于《原神》角色、相关知识产权或上述粉丝美术素材，也不代表对这些素材授予再使用或再分发许可。准备公开发布或分发包含这些素材的版本前，发布者仍需自行确认适用的权利人政策和平台规则，并承担相应风险。

另见根目录 [`FAN_ASSET_NOTICE.md`](../FAN_ASSET_NOTICE.md)。

## 其他公开内容

功能 SVG 图标和界面装饰主要由简单矢量路径、文字或 CSS 组成。README 只引用设置页面截图；包含第三方论文正文的两张旧截图不在本公开准备目录中，也未被 README 引用。
