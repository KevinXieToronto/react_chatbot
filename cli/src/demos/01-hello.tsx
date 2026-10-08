import { render, Box, Text } from 'ink'

function Hello() {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">
        你好，Ink！
      </Text>
      <Text>
        这是 <Text color="green">React</Text> 组件，只不过画在终端里。
      </Text>
      <Text dimColor>没有 DOM，没有 CSS，只有 Box 和 Text。</Text>
      <Text>
        <Text backgroundColor="yellow" color="black">
          {' 警告 '}
        </Text>{' '}
        <Text color="red">红字</Text> <Text underline>下划线</Text>{' '}
        <Text inverse> 反色 </Text>
      </Text>
    </Box>
  )
}

// 没有定时器、也没有监听键盘，画完这一帧进程就自己退出了
render(<Hello />)
