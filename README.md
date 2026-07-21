# 随便想想

这是一个帮助内容创作者记录、整理和分析零散想法的 AI 产品原型。

## 本地启动

1. 将 `.env.example` 复制为 `.env`。
2. 在 `.env` 中填写模型服务的 API Key、接口地址和模型名称。
3. 运行：

```powershell
npm start
```

4. 打开 `http://127.0.0.1:4173/`。

## 请求链路

```text
浏览器 → POST /api/analyze → Node 后端 → AI 模型 → JSON 结果 → 浏览器
```

`.env` 已加入 `.gitignore`。不要把真实 API Key 写入 `app.js`、提交到 Git，或发送给其他人。

## 环境变量

| 变量 | 用途 |
| --- | --- |
| `AI_API_KEY` | 模型服务密钥 |
| `AI_BASE_URL` | OpenAI 兼容接口的基础地址，例如 `https://api.openai.com/v1` |
| `AI_MODEL` | 模型名称，由服务商提供 |
| `AI_API_TYPE` | 接口协议：`chat_completions` 或 `responses` |
| `AI_THINKING_MODE` | 可选：`enabled` 或 `disabled`，用于支持思考模式开关的模型 |
| `ACCESS_CODE` | 小范围预览访问码；留空则不启用访问保护 |
| `DAILY_ANALYSIS_LIMIT` | 每个 IP 在 24 小时内允许的 AI 分析次数 |
| `MINUTE_ANALYSIS_LIMIT` | 每个 IP 每分钟允许的 AI 分析次数 |
| `PORT` | 本地服务端口，默认 `4173` |

## 长期部署（Render）

本项目包含 `render.yaml`，可作为 Render Blueprint 部署。部署前将代码推送到 GitHub，然后在 Render 连接该仓库。

在 Render 的环境变量中填写：

```text
AI_API_KEY=<DeepSeek API Key>
ACCESS_CODE=<分享给体验者的访问码>
```

其余模型、限额和健康检查配置已写在 `render.yaml`。不要上传 `.env`，Render 会自动提供 `PORT`。
