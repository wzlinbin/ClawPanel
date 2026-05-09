# 1. 提交业务代码
git add .
git commit -m "fix: xxx"
git push origin main

# 2. 拉回自动版本号
git fetch origin main
git merge --ff-only origin/main

# 3. 看版本号
Get-Content Makefile -TotalCount 1

# 4. 打 tag
git tag pro-v5.5.9
git push origin pro-v5.5.9


curl -fsSL https://raw.githubusercontent.com/wzlinbin/ClawPanel/main/scripts/install-source.sh | sudo bash
