import { useAssistantSettings } from './useAssistantSettings'

export function useAssistantClient() {
  const settings = useAssistantSettings()

  async function sendChat({ messages, model, temperature = 0.2 }) {
    const modelName = model || settings.modelName.value || 'gpt-4o-mini'
    try {
      const response = await fetch(`${settings.baseUrl.value}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(settings.apiKey.value ? { Authorization: `Bearer ${settings.apiKey.value}` } : {})
        },
        body: JSON.stringify({
          model: modelName,
          temperature,
          messages
        })
      })

      if (!response.ok) {
        const errorBody = await response.text()
        throw new Error(`Assistant request failed: ${response.status} ${errorBody}`)
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content
      return content || 'No response received.'
    } catch (err) {
      console.warn('[assistant] falling back to offline response', err)
      return 'Assistant request failed or offline. Please try again later.'
    }
  }

  return {
    sendChat,
    apiKey: settings.apiKey,
    setApiKey: settings.setApiKey,
    baseUrl: settings.baseUrl,
    setBaseUrl: settings.setBaseUrl,
    modelName: settings.modelName,
    setModelName: settings.setModelName,
    settings
  }
}
