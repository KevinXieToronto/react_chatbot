import { useEffect, useRef } from 'react'
// 按需引入（monaco-editor 0.56 起提供的入口）：只要编辑器核心，
// 不要 TypeScript / CSS / HTML / JSON 的"语言服务"（补全、报错），只读查看用不上，而且它们各带一个几 MB 的 worker
import * as monaco from 'monaco-editor/editor'
// ?worker 是 Vite 的写法：把这个文件单独打成一个 Web Worker，导入的是它的构造函数
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
// 只读查看也用得上的几个编辑器功能：
import 'monaco-editor/features/codicon/register' // 图标字体（查找框、折叠箭头要用）
import 'monaco-editor/features/find/register' // Ctrl+F 查找
import 'monaco-editor/features/folding/register' // 代码折叠
import 'monaco-editor/features/readOnlyMessage/register' // 试图打字时提示"只读"
import 'monaco-editor/features/links/register' // 网址可点击（在 worker 里识别）
// 把"看不见的字符"和"长得像的字母"框出来（在 worker 里计算）。
// 审查 Agent 写的代码时很有用：零宽空格、西里尔字母 а 冒充拉丁字母 a，肉眼根本看不出来
import 'monaco-editor/features/unicodeHighlighter/register'
// 语法高亮（Monarch 规则，纯前端，不需要 worker）。和 languageOf.ts 里的列表对应
import 'monaco-editor/languages/definitions/javascript/register'
import 'monaco-editor/languages/definitions/typescript/register'
import 'monaco-editor/languages/definitions/css/register'
import 'monaco-editor/languages/definitions/html/register'
import 'monaco-editor/languages/definitions/markdown/register'
import 'monaco-editor/languages/definitions/yaml/register'
import 'monaco-editor/languages/definitions/shell/register'
import 'monaco-editor/languages/definitions/bat/register'
import { useTheme } from '../../contexts/ThemeContext'
import { languageOf } from './languageOf'

// Monaco 把一些计算放在后台 worker 里做（识别链接、找可疑字符、比较文本……）。
// 它自己不知道打包之后 worker 文件叫什么、在哪，要我们告诉它怎么创建；
// 不告诉它，它会退回到主线程里跑，并在控制台打警告。
// 我们没引入任何语言服务，只有这一种 worker，所以不管它要哪个（label）都给同一个。
self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
}

interface MonacoViewerProps {
  path: string
  content: string
}

/**
 * 只读的 Monaco 编辑器（VS Code 的编辑器内核）。
 *
 * 和 XTerminal 一样是"外部系统"：React 给一个容器，Monaco 自己管里面的一切。
 * 这个文件只会被 FileViewer 用 React.lazy 动态导入 —— Monaco 有好几 MB，
 * 不打开代码助手、不点开文件，就一个字节都不下载。
 */
export default function MonacoViewer({ path, content }: MonacoViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  /** 当前 model 对应的文件，用来判断是"换了个文件"还是"同一个文件内容变了" */
  const pathRef = useRef<string | null>(null)
  const { resolved } = useTheme()

  // ① 创建 / 销毁编辑器
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const editor = monaco.editor.create(host, {
      readOnly: true,
      // 只读时有人试着打字，会弹一个小提示；这里换成中文
      readOnlyMessage: { value: '只读：让代码助手来改，或者用你自己的编辑器' },
      // 容器大小变了自动重新布局（内部用的也是 ResizeObserver）
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 12,
      scrollBeyondLastLine: false,
      renderLineHighlight: 'none',
    })
    editorRef.current = editor

    return () => {
      // model 不会跟着编辑器一起销毁，要自己释放
      editor.getModel()?.dispose()
      editor.dispose()
      editorRef.current = null
      pathRef.current = null
    }
  }, [])

  // ② 文件或内容变了
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    const model = editor.getModel()
    if (model && pathRef.current === path) {
      // 同一个文件被 Agent 改了（文件面板重新拉取了内容）：
      // 只换内容，并恢复滚动位置 —— 不然每改一次都跳回第一行
      if (model.getValue() !== content) {
        const view = editor.saveViewState()
        model.setValue(content)
        if (view) editor.restoreViewState(view)
      }
      return
    }

    // 换了文件：新建一个 model，释放旧的
    editor.setModel(monaco.editor.createModel(content, languageOf(path)))
    model?.dispose()
    pathRef.current = path
  }, [path, content])

  // ③ 明暗主题。setTheme 是全局的（对页面上所有 Monaco 实例生效）
  useEffect(() => {
    monaco.editor.setTheme(resolved === 'dark' ? 'vs-dark' : 'vs')
  }, [resolved])

  return <div ref={hostRef} className="h-full w-full" />
}
