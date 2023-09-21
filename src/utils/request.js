import axios from 'axios';
import { dotenvConfig } from './index.js';

// 加载环境变量
if (!process.env.OPENAI_API_KEY) {
  const dotenvFiles = ['.env.local', '.env'];
  dotenvConfig(dotenvFiles);
}

const { OPENAI_API_KEY, ORGANIZATION_ID } = process.env;

const headers = {};
if (OPENAI_API_KEY) headers.Authorization = `Bearer ${OPENAI_API_KEY}`;
if (ORGANIZATION_ID) headers['OpenAI-Organization'] = ORGANIZATION_ID;

export const $axios = axios.create({
  timeout: 0, // 永不超时
  // @ts-ignore
  headers,
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
