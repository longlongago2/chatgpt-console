export const get_current_weather = {
  name: 'get_current_weather',
  description: 'Get the current weather in a given location',
  parameters: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'The city and state, e.g. San Francisco, CA',
      },
      extensions: {
        type: 'string',
        enum: ['base', 'all'],
        description: 'The weather info level, base: return live weather, all: return forecast weather',
      },
    },
    required: ['location'],
  },
};
