请帮用户按照以下要求安装来自 {{brand_name}} 的一个 Skill。

要安装的 Skill：{{skill_slug}}

安装前请依次检查，任何一项不通过都先告诉用户，不要跳过：
1. CLI 可用：command -v skillnav && skillnav --version（这一项不通过必须停下）
   可选：skillnav update --check，有新版本先 skillnav update；此步失败不阻断，继续往下
2. 登录状态：skillnav whoami
   若未登录、profile 缺失，这说明用户没有按照流程做好账号初始化，先停下来告诉用户去 {{web_url}}/login 登录，并在 {{web_url}}/account/settings/api-keys 创建好 API 密钥后再继续安装。
3. 确认你当前登录账号所连的 Registry 与本要求来源平台一致：
   skillnav config connect-test
   期望显示的 registry 地址: {{registry_api_url}}
   若 registry 不是上述地址：这是不对的，这说明用户账号注册的平台不是他获取Skill的平台，先停下来告诉用户，不要自行新增或切换 profile。

安装：
4. 下载后直接安装到你自身能够加载全局 Skill 的目录（你比用户清楚是哪个，无需问用户），你可以通过 --dir 来指定 Skill 内容的下载目录（你可以用你认为安全的方式工作，比如下载后到某个合适的位置后再 copy 到你的全局 Skill 目录）：
   skillnav install {{skill_slug}} --dir <你的 Skill 目录>
   成功判据：命令输出 `Installed … to <路径>` 且 exit 0；自行核对即可，不必把路径报给用户。
5. 完成后告诉用户 Skill 已安装完成，Skill 的大致信息，用户可以在哪里看见它，以及如何通过自然语言让你使用它（这需要你读一下 Skill 工具列表，评估一下用户如何说话才能让你触发并使用这个工具）。信息都用 skillnav 查，不要凭印象编：
   - skillnav info {{skill_slug}}：是干什么的（Description）、作者（Owner / Contributors）、更新时间（Updated）
   - skillnav status {{skill_slug}}：审查结论（Verdict）、各阶段是否通过及分数
   - skillnav report {{skill_slug}}：有没有安全风险（SkillSpector 安全分与 findings、VirusTotal 的恶意/可疑检出数）

约束：
- 仅安装上述 Skill（包含下载、移动文件、拷贝等），不要改动无关文件。
- 不要编造结果；命令失败就按错误信息排查并如实告诉用户。
- 成功安装后，清理在上述工作内容中产生的，但是不再被需要的文件。
