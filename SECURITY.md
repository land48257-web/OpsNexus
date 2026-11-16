# Security reporting

Please report suspected vulnerabilities privately, using the repository's **Security → Report a vulnerability** option when it is enabled. If that option is unavailable, ask the repository owner to arrange a private reporting channel without posting vulnerability details in a public issue.

Include the affected commit or version, a minimal reproduction using synthetic assets, expected and actual behavior, and relevant redacted logs. Do not send live passwords, JWTs, private keys, database dumps, or unredacted configuration files. No response-time or supported-release guarantee is currently published.

OpsNexus is intended for trusted internal administrators who share configured assets. Deployment behavior, including SSH host-key handling and optional mongosh execution, is described in the [deployment guide](docs/DEPLOYMENT.md). Reliability bugs without sensitive details can use the normal bug-report form.

## 中文说明

疑似安全漏洞请优先通过仓库的 **Security → Report a vulnerability** 私密报告；入口未启用时，先联系仓库维护者安排私密渠道，不要在公开 Issue 中披露细节。请提供受影响版本、使用演示资产的复现步骤及脱敏日志，不要发送真实密码、JWT、私钥、数据库数据或完整运行配置。
