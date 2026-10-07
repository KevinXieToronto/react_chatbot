import { http } from '../lib/http'
import type { WireMessage } from '../types/chat'

interface ChatResponse {
  text: string
  usage?: { input_tokens: number; output_tokens: number }
  stopReason?: string
  mock?: boolean
}

export const chatApi = {
  async send(messages: WireMessage[]): Promise<ChatResponse> {
    const res = await http.post<ChatResponse>('/chat', { messages })
    return res.data
  },
}
