import { Router } from 'express'
import { WorkspaceError, listWorkspaceFiles, readTextFile } from '../agent/workspace.js'

/**
 * 给前端文件面板用的只读接口。
 * 和 Agent 的工具走【同一套】沙箱函数 —— 浏览器也是不可信的客户端。
 */
export const filesRouter = Router()

function sendError(res, err) {
  if (err instanceof WorkspaceError) {
    return res.status(err.status).json({ message: err.message })
  }
  console.error('[files] 出错：', err)
  res.status(500).json({ message: '读取工作区失败' })
}

// GET /files → { files: [{ path, size }], truncated }
filesRouter.get('/', async (_req, res) => {
  try {
    res.json(await listWorkspaceFiles('.'))
  } catch (err) {
    sendError(res, err)
  }
})

// GET /files/content?path=src/math.js → { path, content, size }
filesRouter.get('/content', async (req, res) => {
  const path = String(req.query.path ?? '')
  try {
    const { content, size } = await readTextFile(path)
    res.json({ path, content, size })
  } catch (err) {
    sendError(res, err)
  }
})
