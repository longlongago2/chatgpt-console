# ChatGPT-console

> ChatGPT for terminal

## Features

- 🤖 Support command line intelliSense, you only need to describe to generate a command line and execute

- ⏱️ Support import/export history chat log

- 🧱 Support proxy openai service

- ⚡ Support third-party api

- 📷 Support image generator


## Usage

### 1. Configure environment variables

```yml
# Create .env.local file

# Your chatGPT API key or the third-party key
OPENAI_API_KEY="your api key"

# [optional] Your ChatGPT Identifier for this organization sometimes used in API requests
ORGANIZATION_ID="your organization id"
```

### 2. Enter the project root directory and install dependencies

```bash
npm install
```

### 3. Start service

```bash
npm start
```

### 4. Global install

_You can use command `chatgpt` by installing it globally_

```bash
npm link

chatgpt
```

## Proxy

**If you are in a country with a Great Firewall, such as China, please use a VPN to assist you and configure it in the .env file.**

```yml
# .env file
# Take Clash as an example, note the port of Clash

HTTP_PROXY="http://127.0.0.1:7890"
HTTPS_PROXY="http://127.0.0.1:7890"
```

or, we support the third-party registry

```yml
# .env file
# ChatGPT registry: default is https://api.openai.com/v1, if you have a third-party registry, please change it here.

CHATGPT_REGISTRY="https://api.openai-sb.com/v1"
```

## Screenshot

<center>

![screenshot](./public/screenshot.gif)

</center>

## FAQ

### 1. 如何申请 openaiKey

_https://platform.openai.com/account/api-keys_

ORGANIZATION_ID 可不用配置，必须配置 OPENAI_API_KEY

### 2. openai 官方文档

_https://platform.openai.com/docs/introduction_

### 3. 开启了代理仍然报网络错误

_ChatGPT 生成对话失败 => Error: Client network socket disconnected before secure TLS connection was established_

目前遇到的情况，一般是代理的问题，请升级 Clash 到最新版本，可以解决。

### 4. nsufficient_quota: You exceeded your current quota, please check your plan and billing details.

_ChatGPT 生成对话失败 => insufficient_quota: You exceeded your current quota, please check your plan and billing details._

这种情况是您的账户需要付费，chatGPT该氪你金了

### 4. Error: Too Many Requests(429)

接口余额不足，需要绑定信用卡

### 5. 如何配置第三方的接口和key

key的配置方式不变，支持第三方接口配置，例如：在 .env 文件中配置 CHATGPT_REGISTRY="https://api.openai-sb.com/v1"


