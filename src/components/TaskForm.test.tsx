import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TaskForm from './TaskForm'

describe('TaskForm', () => {
  it('渲染出所有字段', () => {
    render(<TaskForm onSubmit={vi.fn()} onCancel={vi.fn()} />)

    // getByLabelText 是表单字段的首选查询方式 ——
    // 它同时验证了 label 和 input 的关联是否正确（无障碍）
    expect(screen.getByLabelText(/标题/)).toBeInTheDocument()
    expect(screen.getByLabelText(/描述/)).toBeInTheDocument()
    expect(screen.getByLabelText(/优先级/)).toBeInTheDocument()
  })

  it('填写后提交，把数据交给 onSubmit', async () => {
    // userEvent 模拟真实用户：会触发 focus、keydown、keyup、input、change 完整序列。
    // 比 fireEvent 真实得多，能发现"只监听了 change 没处理 blur"这类 bug。
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(<TaskForm onSubmit={onSubmit} onCancel={vi.fn()} />)

    await user.type(screen.getByLabelText(/标题/), '写周报')
    await user.type(screen.getByLabelText(/描述/), '周五之前')
    await user.selectOptions(screen.getByLabelText(/优先级/), 'high')
    await user.click(screen.getByRole('button', { name: '添加' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith({
      title: '写周报',
      description: '周五之前',
      priority: 'high',
      status: 'todo',
    })
  })

  it('标题太短时不提交，并显示错误', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(<TaskForm onSubmit={onSubmit} onCancel={vi.fn()} />)

    await user.type(screen.getByLabelText(/标题/), 'a')
    await user.click(screen.getByRole('button', { name: '添加' }))

    // 校验是异步的（zodResolver 返回 Promise），所以用 findBy 等它出现
    expect(await screen.findByText('标题至少 2 个字')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('点取消调用 onCancel，且不调用 onSubmit', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onSubmit = vi.fn()

    render(<TaskForm onSubmit={onSubmit} onCancel={onCancel} />)
    await user.click(screen.getByRole('button', { name: '取消' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    // 这条断言很重要：验证"取消"按钮写了 type="button"，
    // 没写的话它会触发表单提交（第 05 章讲过的坑）
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('编辑模式用 initialValue 填充，按钮文字可自定义', () => {
    render(
      <TaskForm
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        initialValue={{
          title: '已有任务',
          description: '已有描述',
          priority: 'low',
          status: 'done',
        }}
        submitText="保存"
      />,
    )

    expect(screen.getByLabelText(/标题/)).toHaveValue('已有任务')
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
  })
})
