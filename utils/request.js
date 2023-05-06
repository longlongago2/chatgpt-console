import axios from 'axios';
import { dotenvConfig } from './index.js';

// 加载环境变量
if (!process.env.OPENAI_API_KEY) {
  const dotenvFiles = ['.env.local', '.env'];
  dotenvConfig(dotenvFiles);
}

const apiKey = process.env.OPENAI_API_KEY;
const organization = process.env.ORGANIZATION_ID;

export const $axios = axios.create({
  timeout: 0, // 永不超时
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'OpenAI-Organization': organization,
  },
});

/**
 * @description
 * @export
 * @param {import('axios').AxiosRequestConfig<any>} config
 * @return {Promise<import('axios').AxiosResponse<any, any>>}
 */
export default function request(config) {
  return $axios.request(config);
}
