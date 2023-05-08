# ChatGPT-console

> chatGPT for terminal

## Usage

### 1. Configure environment variables

```yml
# Create .env.local file

# Your chatGPT API key
OPENAI_API_KEY="sk-4xpqTi08Jn7XX13lI1moT3XXbkXXSzLW7jXXE7oXjMXX"

# Your ChatGPT Identifier for this organization sometimes used in API requests
ORGANIZATION_ID="org-UlXXTumXqaXcEftXXPAo35XX"
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

*You can use command `chatgpt` by installing it globally*

```bash
npm link

chatgpt
```

## Proxy

**If you are in a country with a Great Firewall, such as China, please use a VPN to assist you and configure it in the .env file.**

```yml
# .env file
# Take Clash as an example, note the port of Clash

HTTP_PROXY = http://127.0.0.1:7890
HTTPS_PROXY = http://127.0.0.1:7890
```

### Features

* Support command line intelliSense, you only need to describe to generate a command line and execute

* Support import/export history chat log

* Proxy openai service

* Support image generator

## Screenshot

<center>

![screenshot](./public/screenshot.gif)

</center>

## FAQ

### 1. 如何申请 openaiKey

_https://platform.openai.com/account/api-keys_

### 2.openai 官方文档

_https://platform.openai.com/docs/introduction_
