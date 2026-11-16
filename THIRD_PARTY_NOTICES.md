# Third-party notices

The root [MIT License](LICENSE) applies to original OpsNexus contributions. It does not replace licenses or grant rights over code and assets owned by third parties.

## Bundled Dameng code — redistribution terms unresolved

| Location | Evidence available in this repository | Status |
| --- | --- | --- |
| `pkg/dm` | `VERSION` identifies 8.1.4.80, dated 2025-03-26, revision 33934. Source headers identify 达梦数据库有限公司 and state “All rights reserved.” | No accompanying license or redistribution grant was supplied with this copy |
| `pkg/gormdm` | Source identifies a DM GORM v2 dialect developed against GORM 1.24.2 and imports the local DM driver | No accompanying redistribution terms were supplied with this copy |

The maintainer identifies these as sources publicly provided by Dameng. The original headers, driver version, and driver changelog are preserved. Local changes include package import paths and targeted reliability fixes; see the [2026-11-06 review](docs/reviews/2026-11-06.md). These changes do not establish a license for the underlying code.

Official documentation describes obtaining and using the Go driver and GORM dialect from the Dameng installation's driver directory: [Go driver instructions](https://eco.dameng.com/document/dm/zh-cn/app-dev/go_dm.html), [GORM instructions](https://eco.dameng.com/document/dm/zh-cn/app-dev/go_gorm.html). Those usage instructions alone have not established permission to republish this particular copy.

Before public distribution, record the source and applicable redistribution terms and include required notices. If permission cannot be established, replace the bundled sources with a dependency whose redistribution terms are verified, or exclude the affected integration from the public distribution. Merely adding an MIT file at the project root does not resolve this item. Git history must also be considered if these sources are removed before publication.

## Package-managed dependencies

Go dependencies are recorded in `go.mod` and `go.sum`; frontend dependencies are recorded in `web/package.json` and `web/package-lock.json`. They retain their upstream licenses. Consult the license files shipped with the exact dependency versions when preparing source or binary distributions, and include the notices required by those licenses. This file is not a complete license inventory of all transitive dependencies.

## 中文说明

根目录 MIT 许可仅覆盖项目自有贡献，不替代第三方授权。维护者确认 `pkg/dm` 和 `pkg/gormdm` 来自达梦原厂公开源码；当前副本没有附带再分发许可，具体条款仍需在公开发布前确认。需要附带对应许可和必要声明，或采用授权明确的替代方案。若删除相关代码后公开仓库，还需检查历史提交是否仍包含这些源码。
