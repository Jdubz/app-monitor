declare module 'node-pty' {
  export * from 'node-pty-prebuilt-multiarch';
  export { spawn as default } from 'node-pty-prebuilt-multiarch';
}
