import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @napi-rs/canvas 是原生模組（.node binding），不能被打包進 ESM chunk；
  // 標為 server external，讓 Next 在執行期以 require 載入（修 Turbopack「non-ecmascript placeable asset」）
  serverExternalPackages: ['@napi-rs/canvas'],
};

export default nextConfig;
