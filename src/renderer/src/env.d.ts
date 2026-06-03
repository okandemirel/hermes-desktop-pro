/// <reference types="vite/client" />

declare module "*.png?asset" {
  const value: string;
  export default value;
}

declare module "*.png" {
  const value: string;
  export default value;
}

declare module "*.svg" {
  const value: string;
  export default value;
}

interface Window {
  hermes: import("../preload/index").HermesAPI;
}
