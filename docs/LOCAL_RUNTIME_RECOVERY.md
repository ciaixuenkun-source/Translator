# 本地模型与 llama.cpp 运行环境恢复说明

本文记录 2026-11-14 在开发机上核实到的恢复信息。模型和运行库均不应提交到 Translator GitHub 仓库。

## Qwen GGUF

- 上游项目：`unsloth/Qwen3-4B-Instruct-2507-GGUF`
- 文件：`Qwen3-4B-Instruct-2507-Q4_K_M.gguf`
- 当前文件大小：`2,497,281,120` 字节
- SHA256：`3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597`
- 官方页面：<https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/blob/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf>

下载后应校验文件大小和 SHA256。模型不在 npm 安装或 portable 构建过程中自动下载。

## 当前验证过的 llama.cpp 组合

- llama.cpp Release：`b11146`
- 上游提交：`7fe450e19305b828c199d602c23a8337aaa1f03b`
- 发布日期：2026-09-23
- 平台：Windows x64
- 后端：CUDA 12.4
- 官方 Release：<https://github.com/ggml-org/llama.cpp/releases/tag/b11146>

GitHub 官方 Release 元数据列出的两个资产为：

| 用途 | 官方资产文件 | 大小 | 官方 SHA256 |
|---|---|---:|---|
| llama.cpp Windows x64 CUDA 12.4 主程序 | `llama-b11146-bin-win-cuda-12.4-x64.zip` | 253,869,799 字节 | `3c806a6ceccc3dae1c743ceb1a1fb2cce5b76f40bfbd4c6b7b8afb6ef45a5807` |
| CUDA 12.4 配套 DLL | `cudart-llama-bin-win-cuda-12.4-x64.zip` | 391,443,627 字节 | `8c79a9b226de4b3cacfd1f83d24f962d0773be79f1e7b75c6af4ded7e32ae1d6` |

官方下载地址遵循上述 Release 的资产链接。请从 Release 页面进入，不要从不明镜像获取。恢复时应解压两个包到同一个 runtime 目录并保留全部配套 DLL，不能只复制 `llama-server.exe`。

本机目录结构和官方 Release 描述与这两个资产相符，但本轮按要求没有重新下载原始 ZIP，因此没有对“当前每个解压文件是否逐字节等同于官方 ZIP 内容”作重新比对。

## 当前关键运行文件校验

以下 SHA256 来自当前开发机运行库目录。完整目录还包含其他 llama.cpp 工具；Translator 实际启动入口是 `llama-server.exe`，其运行依赖同目录中的 llama、ggml、CUDA 和 OpenMP DLL。

```text
e40202fe4223c1cd2d2dce7beec59e1ed61c7801bd827309183be9b50e358f4c  cublas64_12.dll
2a896460bef60ed57ef32b0875812f355a6984e671d638bb632f5e8c1d7a831f  cublasLt64_12.dll
d28e42265da7462162a54da6b7a99ea4fa2caf8139d862bb500db875d0b32dfc  cudart64_12.dll
da454325a1cdb658c469983ef78bc7c23a2729394607c2583446db4c19f7bcda  ggml.dll
be315e18c795d15658f5d13b4a6e0b4cd534b7d69f6d4093db60ea74b0ada159  ggml-base.dll
ff312c4aa238d96ff6297384469235e37dde22a82df442d5b903546cf997b9c2  ggml-cpu-x64.dll
a5a5e1e6c4a7cf9575ad7929dd1b5aca08dfbcbea2002e02b554a4895e03c679  ggml-cuda.dll
a12116ba72d1d6820407cf30be23da04ce79d6bb8a71a5ee71759c5a1faa6f1c  libomp.dll
8bc4713fde3b48a35c06c6d503c9fd128d349275e6fad6b48d235796c9d9739f  llama.dll
5a07bd8dfb7626476a47b4931e278c82518991b4faf85ce42cde82eb0ce6bb50  llama-common.dll
7b886298b688509ced3e92b420edd57dd3d665da72c1fc207d7a537be5870352  llama-server.exe
fae1ca8959986062a24c7b0a92e12a782f2770fc5448c7cc631f0d4bb6cac4a0  llama-server-impl.dll
```

不同 CPU 可能由 ggml 动态选择其他 `ggml-cpu-*.dll`。因此恢复时应使用完整官方发行包，而不是把上表当作最小文件复制清单。

## 恢复步骤

1. 从官方 llama.cpp `b11146` Release 下载两个 Windows x64 CUDA 12.4 ZIP。
2. 校验两个 ZIP 的 SHA256。
3. 将两个 ZIP 解压、合并到同一个独立 runtime 目录。
4. 确认 `llama-server.exe` 和配套 DLL 均存在。
5. 下载 Qwen GGUF，校验文件大小和 SHA256。
6. 设置 `TRANSLATOR_LLAMA_RUNTIME_DIR` 和 `TRANSLATOR_QWEN_MODEL_DIR`。
7. 启动 Translator，并在不调用在线 API 的情况下进行一次本地翻译验证。

只有在隔离目录完成上述恢复验证后，才适合清理旧运行库和模型副本。
