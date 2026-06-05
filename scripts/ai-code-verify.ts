#!/usr/bin/env tsx

/**
 * AI 代码验证工具
 *
 * 利用模型自身能力进行代码质量验证（一致性检查、自我批评、事实检查）
 * 无需外部工具侵入，无需 API Key
 */

import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { execSync } from 'node:child_process'
import type { Config } from './types.ts'

interface VerifyResult {
  file: string
  level: number
  passed: boolean
  issues: string[]
  score: number
  prompt?: string
}

/**
 * 加载配置文件
 */
async function loadConfig(): Promise<Config> {
  const configPath = resolve(process.cwd(), '.ai-code-verify.json')

  if (!existsSync(configPath)) {
    return {
      level: 0,
      enabled: true,
      ignorePatterns: ['node_modules', 'dist', 'build', '.git'],
      includePatterns: ['src/**/*.{ts,tsx,js,jsx}', 'lime-rs/**/*.rs'],
    }
  }

  const content = await readFile(configPath, 'utf-8')
  return JSON.parse(content)
}

/**
 * 静态代码检查（不调用 AI）
 */
function staticChecks(code: string, filePath: string): VerifyResult {
  const issues: string[] = []
  let score = 100

  // JavaScript/TypeScript 安全检查
  if (/\.(ts|tsx|js|jsx)$/.test(filePath)) {
    // 危险模式检查
    const dangerousPatterns = [
      { pattern: /eval\s*\(/, msg: '使用 eval() 可能存在代码注入风险', impact: -20 },
      { pattern: /Function\s*\(\s*['"]/, msg: '使用 Function 构造器可能存在安全风险', impact: -20 },
      { pattern: /innerHTML\s*=/, msg: '使用 innerHTML 可能存在 XSS 风险', impact: -15 },
      { pattern: /dangerouslySetInnerHTML/, msg: '使用 dangerouslySetInnerHTML 可能存在 XSS 风险', impact: -15 },
      { pattern: /document\.write\s*\(/, msg: '使用 document.write() 可能存在安全风险', impact: -10 },
      { pattern: /\.exec\s*\(/, msg: '使用 .exec() 可能存在命令注入风险', impact: -15 },
    ]

    dangerousPatterns.forEach(({ pattern, msg, impact }) => {
      if (pattern.test(code)) {
        issues.push(msg)
        score += impact
      }
    })

    // 代码质量问题
    if (code.includes('console.log')) {
      issues.push('代码中包含 console.log，应该清理')
      score -= 5
    }
    if (code.includes('debugger')) {
      issues.push('代码中包含 debugger 语句')
      score -= 5
    }

    // TODO 检查
    const todoCount = (code.match(/\/\/ TODO/g) || []).length
    if (todoCount > 3) {
      issues.push(`存在 ${todoCount} 个 TODO 未处理`)
      score -= Math.min(todoCount * 2, 10)
    }

    // 空长行检查
    const lines = code.split('\n')
    const longLines = lines.filter(line => line.length > 120)
    if (longLines.length > 0) {
      issues.push(`存在 ${longLines.length} 行超过 120 字符的代码`)
      score -= Math.min(longLines.length, 5)
    }
  }

  // Rust 安全检查
  if (/\.rs$/.test(filePath)) {
    if (code.includes('unsafe {')) {
      issues.push('使用 unsafe 块，需要手动验证安全性')
      score -= 10
    }
    if (code.includes('.unwrap()')) {
      issues.push('使用 .unwrap() 可能导致 panic')
      score -= 5
    }
    if (code.includes('.expect(') && !code.includes('.ok(')) {
      issues.push('使用 .expect() 但没有 .ok() 处理错误')
      score -= 10
    }
  }

  score = Math.max(0, Math.min(100, score))
  const passed = score >= 60

  return {
    file: filePath,
    level: 0,
    passed,
    issues,
    score,
  }
}

/**
 * 生成 AI 验证 Prompt（供用户复制到 AI 对话框）
 */
function generateVerifyPrompt(code: string, filePath: string, level: number): string {
  const prompts = {
    0: `# AI 代码验证请求 (Level 0: 基础验证)

请分析以下代码并进行一致性检查：

**文件**: ${filePath}

\`\`\`${
    code.split('\n').map((line, i) => `${(i + 1).toString().padStart(4, ' ')}│${line}`).join('\n')
  }\`\`\`

**步骤**：
1. 生成解决方案 A：从第一性原理思考这个问题的解决方案
2. 生成解决方案 B：使用**不同的推理路径**（避免参考步骤 A）
3. 一致性检查：比较 A 和 B 的核心逻辑，标识关键差异
4. 选择更合理/简洁/可维护的方案
5. 说明选择理由

**输出格式**：
\`\`\`markdown
## 验证报告

### 一致性分析
[说明 A 和 B 方案的核心逻辑、差异、选择理由]

### 发现的问题
- [问题 1]
- [问题 2]
...

### 评分
[0-100，说明理由]

### 建议
[如何改进]
\`\`\`
`,

    1: `# AI 代码验证请求 (Level 1: 中级验证)

请分析以下代码并进行安全审查和自我批评：

**文件**: ${filePath}

\`\`\`${
    code.split('\n').map((line, i) => `${(i + 1).toString().padStart(4, ' ')}│${line}`).join('\n')
  }\`\`\`

**步骤**：
1. 一致性检查（生成 A/B 方案并比较）
2. 安全审查：
   - 输入验证：是否验证用户输入？是否防注入？
   - 权限控制：是否有未授权访问风险？
   - 数据保护：是否有敏感数据泄露？
   - 依赖安全：使用的库是否有已知漏洞？
   - 错误处理：是否暴露内部信息？
3. 自我批评：
   - 逻辑正确性：是否有边界情况未处理？
   - 代码质量：是否过度复杂？是否有重复代码？
   - 可维护性：后续修改会困难吗？
   - 安全性：有注入风险吗？有敏感信息泄露吗？

**输出格式**：
\`\`\`markdown
## 验证报告

### 一致性分析
[...]

### 安全审查
- 输入验证：[...]
- 权限控制：[...]
- 数据保护：[...]
- 依赖安全：[...]
- 错误处理：[...]

### 自我批评
- 逻辑正确性：[...]
- 代码质量：[...]
- 可维护性：[...]
- 安全性：[...]

### 发现的问题
- [安全问题1]
- [质量问题2]
...

### 评分
[0-100，说明理由]

### 建议
[如何改进]
\`\`\`
`,

    2: `# AI 代码验证请求 (Level 2: 高级验证)

请对以下代码进行深度反思验证：

**文件**: ${filePath}

\`\`\`${
    code.split('\n').map((line, i) => `${(i + 1).toString().padStart(4, ' ')}│${line}`).join('\n')
  }\`\`\`

**步骤**：
1. 一致性检查（生成 A/B 方案并比较）
2. 安全审查和自我批评（同 Level 1）
3. 深度反思：
   - 元认知反思：推理过程是否合理？是否有认知偏差？
   - 替代理理：如果是另一个 AI，会如何评价这个代码？
   - 场景模拟：在生产环境、高并发、异常情况会发生什么？

**输出格式**：
\`\`\`markdown
## 验证报告

### 一致性分析
[...]

### 安全审查
[...]

### 自我批评
[...]

### 深度反思
#### 元认知反思
[...]

#### 替代理理
[...]

#### 场景模拟
[...]

### 发现的问题
- [深层问题1]
- [深层问题2]
...

### 评分
[0-100，说明理由]

### 建议
[如何改进]
\`\`\`
`,
  }

  return prompts[level as keyof typeof prompts] || prompts[0]
}

/**
 * 验证单个文件
 */
async function verifyFile(filePath: string, config: Config): Promise<VerifyResult> {
  try {
    const content = await readFile(filePath, 'utf-8')

    // 静态检查
    const staticResult = staticChecks(content, filePath)

    // 生成 AI Prompt（如果需要）
    if (config.generatePrompt) {
      staticResult.prompt = generateVerifyPrompt(content, filePath, config.level)
    }

    return staticResult
  }
  catch (error) {
    return {
      file: filePath,
      level: 0,
      passed: false,
      issues: [`验证失败: ${error}`],
      score: 0,
    }
  }
}

/**
 * 获取待验证的文件列表
 */
function getFilesToVerify(config: Config): string[] {
  try {
    // 验证器自身包含规则关键字，跳过以避免自触发误报
    const selfExcludedFiles = new Set(['scripts/ai-code-verify.ts'])

    // 获取 git 暂存的文件
    const output = execSync('git diff --cached --name-only --diff-filter=ACM', {
      encoding: 'utf-8',
    }).trim()

    if (!output) {
      return []
    }

    const files = output.split('\n')
      .filter(file => {
        if (selfExcludedFiles.has(file)) {
          return false
        }

        // 过滤忽略的目录
        const shouldIgnore = config.ignorePatterns.some(pattern =>
          file.includes(pattern)
        )
        return !shouldIgnore
      })

    return files
  }
  catch (error) {
    console.error('获取文件列表失败:', error)
    return []
  }
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2)
  const config = await loadConfig()

  // 解析命令行参数
  const filesArg = args.findIndex(arg => arg === '--files')
  const levelArg = args.findIndex(arg => arg === '--level')
  const generatePromptArg = args.findIndex(arg => arg === '--generate-prompt')

  if (levelArg !== -1) {
    config.level = Number.parseInt(args[levelArg + 1], 10)
  }

  if (generatePromptArg !== -1) {
    config.generatePrompt = true
  }

  // 获取待验证文件
  let filesToVerify: string[] = []

  if (filesArg !== -1) {
    // 手动指定文件
    filesToVerify = args.slice(filesArg + 1).filter(f => !f.startsWith('--'))
  }
  else {
    // 从 git 获取暂存的文件（pre-commit 模式）
    filesToVerify = getFilesToVerify(config)
  }

  if (filesToVerify.length === 0) {
    console.log('✅ 没有文件需要验证')
    process.exit(0)
  }

  console.log(`🔍 AI 代码验证 (Level ${config.level})`)
  console.log(`📁 待验证文件: ${filesToVerify.length}\n`)

  // 验证所有文件
  const results: VerifyResult[] = []

  for (const file of filesToVerify) {
    console.log(`⏳ 验证: ${file}`)
    const result = await verifyFile(file, config)
    results.push(result)

    if (result.passed) {
      console.log(`  ✅ 通过 (${result.score}/100)`)
    }
    else {
      console.log(`  ❌ 失败 (${result.score}/100)`)
      result.issues.forEach(issue => console.log(`     - ${issue}`))
    }

    if (result.prompt && config.generatePrompt) {
      console.log(`\n📋 AI 验证 Prompt:\n`)
      console.log('━'.repeat(50))
      console.log(result.prompt)
      console.log('━'.repeat(50))
      console.log('\n提示：将上述 Prompt 复制到 AI 对话框中获取详细分析\n')
    }

    console.log()
  }

  // 汇总
  const passed = results.filter(r => r.passed).length
  const failed = results.length - passed
  const avgScore = Math.round(
    results.reduce((sum, r) => sum + r.score, 0) / results.length
  )

  console.log('━'.repeat(50))
  console.log(`📊 验证结果: ${passed} 通过, ${failed} 失败`)
  console.log(`📊 平均分: ${avgScore}/100`)

  if (failed > 0) {
    console.log('\n❌ 存在文件未通过验证')
    console.log('\n提示：使用 --generate-prompt 生成 AI 验证 Prompt')
    process.exit(1)
  }

  console.log('\n✅ 所有文件验证通过')
  process.exit(0)
}

main().catch(error => {
  console.error('验证工具执行失败:', error)
  process.exit(1)
})
