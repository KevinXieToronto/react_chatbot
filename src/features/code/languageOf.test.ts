import { describe, it, expect } from 'vitest'
import { languageOf } from './languageOf'

describe('languageOf', () => {
  it('按扩展名认语言，大小写不敏感', () => {
    expect(languageOf('src/math.js')).toBe('javascript')
    expect(languageOf('src/App.TSX')).toBe('typescript')
    expect(languageOf('README.md')).toBe('markdown')
    expect(languageOf('scripts/build.cmd')).toBe('bat')
  })

  it('认不出的、没有扩展名的、点开头的文件都是 plaintext', () => {
    expect(languageOf('data.xyz')).toBe('plaintext')
    expect(languageOf('LICENSE')).toBe('plaintext')
    expect(languageOf('.gitignore')).toBe('plaintext')
  })

  it('只看文件名，不被目录名里的点骗到', () => {
    expect(languageOf('v1.2/Makefile')).toBe('plaintext')
  })
})
