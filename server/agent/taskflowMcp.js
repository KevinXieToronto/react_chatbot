import { McpServer, InMemoryTransport } from '@modelcontextprotocol/server'
import { Client } from '@modelcontextprotocol/client'
import { z } from 'zod'
import { runTool } from './tools.js'

/**
 * 把第 25 章的任务工具包装成一个 MCP 服务器（第 34 章）。
 *
 * 用的是 MCP 官方的 TypeScript SDK（@modelcontextprotocol/server）。工具的真正实现一行没改，
 * 还是 tools.js 里的 runTool —— 同一套校验、同一个 db.json。
 * 参数用 zod 描述（SDK 会把它转成 JSON Schema 放进 tools/list 的结果里），
 * handler 收到的 args 已经按 schema 校验过；runTool 里的校验照样保留，多一层不嫌多。
 *
 * 这个服务器不知道谁会来用它：今天是 OpenAI Agents SDK，明天换成别的支持 MCP 的 Agent，一行都不用改。
 */

const STATUS = z.enum(['todo', 'doing', 'done'])
const PRIORITY = z.enum(['low', 'medium', 'high'])

/**
 * runTool 的结果 → MCP 的 CallToolResult。
 * 失败时和手写循环一样交回 {"error": "..."}（loop.js 的 toResultContent），并标上 isError
 */
async function call(name, args) {
  const r = await runTool(name, args)
  return r.ok
    ? { content: [{ type: 'text', text: JSON.stringify(r.data) }] }
    : { content: [{ type: 'text', text: JSON.stringify({ error: r.error }) }], isError: true }
}

export function createTaskflowMcpServer() {
  const server = new McpServer({ name: 'taskflow', version: '1.0.0' })

  server.registerTool(
    'list_tasks',
    {
      description: '查询用户的任务列表，可以按状态、优先级、关键词筛选。需要知道用户有哪些任务时先调用它，不要编造。',
      inputSchema: z.object({
        status: z.enum(['todo', 'doing', 'done', 'all']).optional().describe('按状态筛选，默认 all'),
        priority: z.enum(['low', 'medium', 'high', 'all']).optional().describe('按优先级筛选，默认 all'),
        keyword: z.string().optional().describe('按标题 / 描述模糊匹配'),
      }),
      // 只读工具打上 readOnlyHint，MCP 客户端可以据此少问一次
      annotations: { readOnlyHint: true },
    },
    (args) => call('list_tasks', args),
  )

  server.registerTool(
    'create_task',
    {
      description: '创建一个新任务。只有用户明确要新建、并且给了标题时才调用。',
      inputSchema: z.object({
        title: z.string().describe('任务标题，2~50 个字'),
        description: z.string().optional(),
        priority: PRIORITY.optional(),
        status: STATUS.optional(),
      }),
    },
    (args) => call('create_task', args),
  )

  server.registerTool(
    'update_task',
    {
      description: '更新一个已有任务（比如把 status 改成 done）。必须先用 list_tasks 拿到正确的 id。',
      inputSchema: z.object({
        id: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        priority: PRIORITY.optional(),
        status: STATUS.optional(),
      }),
    },
    (args) => call('update_task', args),
  )

  server.registerTool(
    'delete_task',
    {
      description: '删除一个任务，不可恢复。',
      inputSchema: z.object({ id: z.string() }),
      annotations: { destructiveHint: true },
    },
    (args) => call('delete_task', args),
  )

  return server
}

/**
 * 用"进程内"的方式把一个 MCP 服务器交给 OpenAI Agents SDK。
 *
 * Agents SDK 自带的 MCPServerStdio / MCPServerStreamableHttp，要么起一个子进程，要么走 HTTP。
 * 可我们的任务数据有内存缓存（db.js）：另起一个进程去改 db.json，这边的缓存就过期了，
 * 看板上看不到变化，下一次写入还会把它覆盖掉。
 *
 * 所以和教程里 Claude 的 createSdkMcpServer 一样，让服务器就活在我们自己的进程里：
 * 用 MCP 官方 SDK 的 InMemoryTransport 把一个 Client 和服务器直接连起来。中间走的仍然是
 * 标准的 MCP JSON-RPC 消息（initialize、tools/list、tools/call），只是不经过网络、不起进程。
 *
 * Agents SDK 对 mcpServers 里的对象只要求实现 MCPServer 接口（connect / listTools / callTool / close …），
 * 这个类就是一个最小的实现。
 */
export class InProcessMcpServer {
  cacheToolsList = true

  /**
   * @param {string} name 服务器名。打开 includeServerInToolNames 后，工具名会变成 mcp_<name>__<工具名>
   * @param {() => McpServer} createServer 每次 connect 都新建一个服务器实例
   */
  constructor(name, createServer) {
    this.name = name
    this.createServer = createServer
    this.server = null
    this.client = null
  }

  async connect() {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    this.server = this.createServer()
    this.client = new Client({ name: 'taskflow-agent', version: '1.0.0' })
    await this.server.connect(serverTransport)
    await this.client.connect(clientTransport)
  }

  async listTools() {
    const { tools } = await this.client.listTools()
    return tools
  }

  /** 完整的 CallToolResult（带 isError）。Agents SDK 有这个方法时优先用它 */
  callToolResult(toolName, args) {
    return this.client.callTool({ name: toolName, arguments: args ?? {} })
  }

  async callTool(toolName, args) {
    const result = await this.callToolResult(toolName, args)
    return result.content
  }

  async invalidateToolsCache() {}

  async close() {
    await this.client?.close()
    await this.server?.close()
    this.client = null
    this.server = null
  }
}
