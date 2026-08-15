// 鲸鱼桌宠 v2 —— 宿主端插件源码
//
// 职责：采集 Agent 状态与事件（忙碌/空闲/出错/用户消息/工具执行/批准请求），
//      保存在一个 JSON 状态快照中，通过 harness.handle('pet/poll') 供客户端轮询。
// 本文件与 cordis_define 提交的代码一致，仅增加了此注释头。
return {
  apply(ctx) {
    // 只保存自有 JSON 状态：事件环形缓冲 + 当前 Agent 状态
    const state = { status: 'idle', events: [] }

    const push = (kind, tool) => {
      state.events.push({ kind, tool: tool || null, ts: Date.now() })
      if (state.events.length > 100) state.events.shift()
    }

    // Agent 忙碌/空闲
    ctx.on('agent/status', (payload) => {
      if (!payload || (payload.status !== 'idle' && payload.status !== 'running')) return
      state.status = payload.status
      push(payload.status === 'running' ? 'agent-start' : 'agent-idle')
    })

    // 出错
    ctx.on('agent/error', () => { push('agent-error') })

    // 用户发来消息
    ctx.on('agent/inbox/inserted', () => { push('user-message') })

    // 工具开始执行（waterfall，必须透传 next）
    ctx.on('tools/execute', async (exec, next) => {
      try {
        const name = exec && typeof exec.name === 'string' ? exec.name : null
        if (name) push('tool-start', name)
      } finally {
        return next()
      }
    })

    // 批准请求与结果（waterfall，必须透传 next）
    ctx.on('approval/request', async (req, next) => {
      push('approval-ask')
      const outcome = await next()
      if (outcome === 'allowed-once') push('approval-yes')
      else if (outcome === 'rejected') push('approval-no')
      return outcome
    })

    // 客户端轮询接口：返回状态快照并清空已读事件
    harness.handle('pet/poll', async () => {
      const out = { status: state.status, events: state.events }
      state.events = []
      return out
    })
  },
}